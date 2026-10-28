package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// createNightRequest is the JSON body of POST /groups/{groupId}/nights.
type createNightRequest struct {
	ScheduledFor string   `json:"scheduledFor"`
	StartTime    *string  `json:"startTime"`
	Attendees    []string `json:"attendees"`
	PickerID     string   `json:"pickerId"`
}

// parsedCreateNight is a validated createNightRequest. Attendees is deduped,
// first-seen order, and always contains Picker.
type parsedCreateNight struct {
	ScheduledFor pgtype.Date
	StartTime    pgtype.Time
	Attendees    []uuid.UUID
	Picker       uuid.UUID
}

// errPickerNotAttendee is the 422 shared by create, record-pick and edit: a
// Night's picker is always one of its attendees.
var errPickerNotAttendee = errors.New("picker is not an attendee of this night")

// errNotMember is the 422 for an attendee who has no membership in the group;
// attendeeRoles wraps it with the offending id.
var errNotMember = errors.New("attendee is not a member of this group")

// parseAttendeeIDs parses and de-duplicates attendee UUID strings, preserving
// first-seen order. Always returns a non-nil slice. Pure.
func parseAttendeeIDs(raw []string) ([]uuid.UUID, error) {
	seen := make(map[uuid.UUID]bool, len(raw))
	ids := make([]uuid.UUID, 0, len(raw))
	for _, s := range raw {
		id, err := uuid.Parse(s)
		if err != nil {
			return nil, fmt.Errorf("invalid attendee id")
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	return ids, nil
}

// parseScheduledFor parses the wire scheduledFor into a DATE param, naming the
// field in the error. Shared by create and the edit PATCH so the two paths
// can't disagree on the accepted format. Pure.
func parseScheduledFor(raw string) (pgtype.Date, error) {
	d, err := parseDate(raw)
	if err != nil {
		return pgtype.Date{}, fmt.Errorf("invalid scheduledFor")
	}
	return d, nil
}

// startTimeLayout is a Night's start time on the wire: a zone-less HH:MM, read
// on each device's own clock (ADR-0011).
const startTimeLayout = "15:04"

// parseStartTime parses a wire start time into a TIME param, naming the field
// in the error. Pure.
func parseStartTime(raw string) (pgtype.Time, error) {
	t, err := time.Parse(startTimeLayout, raw)
	if err != nil || len(raw) != len(startTimeLayout) {
		return pgtype.Time{}, fmt.Errorf("invalid startTime: want HH:MM")
	}
	return pgtype.Time{Microseconds: int64(t.Hour()*60+t.Minute()) * int64(time.Minute/time.Microsecond), Valid: true}, nil
}

// parseOptionalStartTime is parseStartTime for the wire's nullable field: nil
// is no start time (not Valid). Shared by create and edit. Pure.
func parseOptionalStartTime(raw *string) (pgtype.Time, error) {
	if raw == nil {
		return pgtype.Time{}, nil
	}
	return parseStartTime(*raw)
}

// formatStartTimeWire is a start time as the wire carries it: HH:MM, or nil
// when the Night has none. Pure.
func formatStartTimeWire(t pgtype.Time) *string {
	if !t.Valid {
		return nil
	}
	s := time.Time{}.Add(time.Duration(t.Microseconds) * time.Microsecond).Format(startTimeLayout)
	return &s
}

// validateCreateNightRequest validates a decoded body: scheduledFor must be an
// ISO (YYYY-MM-DD) date, startTime (optional) an HH:MM time, every attendee and
// the picker must be UUIDs, and the picker must be among the attendees
// (errPickerNotAttendee). Pure — no DB, no clock.
func validateCreateNightRequest(req createNightRequest) (parsedCreateNight, error) {
	scheduledFor, err := parseScheduledFor(req.ScheduledFor)
	if err != nil {
		return parsedCreateNight{}, err
	}
	startTime, err := parseOptionalStartTime(req.StartTime)
	if err != nil {
		return parsedCreateNight{}, err
	}
	attendees, err := parseAttendeeIDs(req.Attendees)
	if err != nil {
		return parsedCreateNight{}, err
	}
	picker, err := uuid.Parse(req.PickerID)
	if err != nil {
		return parsedCreateNight{}, fmt.Errorf("invalid picker id")
	}
	if !slices.Contains(attendees, picker) {
		return parsedCreateNight{}, errPickerNotAttendee
	}
	return parsedCreateNight{
		ScheduledFor: scheduledFor,
		StartTime:    startTime,
		Attendees:    attendees,
		Picker:       picker,
	}, nil
}

// attendee is one person recorded as present on a night.
type attendee struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

// remindersDTO is a Night's shared reminder settings (ADR-0010): which slots
// are on and who they go to. Audience is "everyone" or "picker"; the picker's
// nudge goes out whatever these say.
type remindersDTO struct {
	NightBefore    bool   `json:"nightBefore"`
	MorningOf      bool   `json:"morningOf"`
	TwoHoursBefore bool   `json:"twoHoursBefore"`
	Audience       string `json:"audience"`
}

// nightResponse is the JSON shape for a night and its current attendees. Every
// night has a picker (ADR-0008); Movie is null until a film is attached.
type nightResponse struct {
	ID           string       `json:"id"`
	ScheduledFor string       `json:"scheduledFor"`
	StartTime    *string      `json:"startTime"`
	PickerID     string       `json:"pickerId"`
	Movie        *movieDTO    `json:"movie"`
	Attendees    []attendee   `json:"attendees"`
	Reminders    remindersDTO `json:"reminders"`
}

// toAttendee builds the attendee DTO. The single-night query and the grouped
// history query return different row types carrying the same three fields, so
// both funnel through here and their JSON cannot drift apart.
func toAttendee(id uuid.UUID, name string, role db.MembershipRole) attendee {
	return attendee{ID: id.String(), Name: name, Role: string(role)}
}

// newNightResponse assembles the night DTO from a night row and its attendees.
// The detail path and the history-list path read attendees in different row
// shapes but both build through here, so a new field is added once. Attendees
// is normalized to non-nil so an empty list encodes as [] rather than null.
func newNightResponse(night nightRow, atts []attendee) nightResponse {
	if atts == nil {
		atts = []attendee{}
	}
	return nightResponse{
		ID:           night.ID.String(),
		ScheduledFor: formatDate(night.ScheduledFor),
		StartTime:    formatStartTimeWire(night.StartTime),
		PickerID:     night.PickerID.String(),
		Movie:        movieDTOFromCols(night),
		Attendees:    atts,
		Reminders: remindersDTO{
			NightBefore:    night.RemindNightBefore,
			MorningOf:      night.RemindMorningOf,
			TwoHoursBefore: night.RemindTwoHoursBefore,
			Audience:       string(night.RemindAudience),
		},
	}
}

// nightRow is a full Night: a row of the nights view, which every Night read
// selects from, so this is the one shape a Night response is built from.
type nightRow = db.Night

// toNightResponse maps a night row + attendee rows to the night DTO.
func toNightResponse(night nightRow, rows []db.ListNightAttendeesRow) nightResponse {
	attendees := make([]attendee, 0, len(rows))
	for _, r := range rows {
		attendees = append(attendees, toAttendee(r.ID, r.Name, r.Role))
	}
	return newNightResponse(night, attendees)
}

// movieDTOFromCols builds the movie DTO from a night row's nullable LEFT JOIN
// columns; nil when the night has no movie attached. It is the only movie-row
// mapper, so a new movie field is added here and to the night select lists.
func movieDTOFromCols(row nightRow) *movieDTO {
	if !row.MovieTmdbID.Valid {
		return nil
	}
	return &movieDTO{
		TMDBID:      row.MovieTmdbID.Int32,
		Title:       row.MovieTitle.String,
		ReleaseYear: releaseYearPtr(row.MovieReleaseYear),
		PosterURL:   posterURLPtr(row.MoviePosterPath),
	}
}

// groupAttendees buckets attendee rows by their night (pick_id), preserving the
// query's role-then-name order within each night.
func groupAttendees(rows []db.ListNightsAttendeesRow) map[uuid.UUID][]attendee {
	byNight := make(map[uuid.UUID][]attendee, len(rows))
	for _, r := range rows {
		byNight[r.PickID] = append(byNight[r.PickID], toAttendee(r.ID, r.Name, r.Role))
	}
	return byNight
}

// toNightResponses assembles the ordered nights list from night rows
// and the attendees grouped by night. A nil byNight (no night had attendees) is
// fine: reads from a nil map yield the zero value, which newNightResponse
// normalizes to [].
func toNightResponses(rows []nightRow, byNight map[uuid.UUID][]attendee) []nightResponse {
	out := make([]nightResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, newNightResponse(row, byNight[row.ID]))
	}
	return out
}

// listNightsHandler serves GET /groups/{groupId}/nights — every night of the
// group, past and upcoming, newest first. Two set-based queries (the nights, then all
// of their attendees in one shot) keep it constant in the number of nights.
func listNightsHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}
		ctx := r.Context()
		rows, err := store.ListNights(ctx, gid)
		if err != nil {
			internalError(w, gid, "list nights", err)
			return
		}
		var byNight map[uuid.UUID][]attendee
		if len(rows) > 0 {
			ids := make([]uuid.UUID, 0, len(rows))
			for _, row := range rows {
				ids = append(ids, row.ID)
			}
			attRows, err := store.ListNightsAttendees(ctx, db.ListNightsAttendeesParams{GroupID: gid, NightIds: ids})
			if err != nil {
				internalError(w, gid, "list nights attendees", err)
				return
			}
			byNight = groupAttendees(attRows)
		}
		respondJSON(w, http.StatusOK, toNightResponses(rows, byNight), gid, "encode nights list response")
	}
}

// presentIDs extracts attendee user IDs as a NON-NIL (possibly empty) slice to
// pass as RankGroupTurn's present set. Empty (not nil) makes the ranking exclude
// everyone — distinct from nil, which RankGroupTurn treats as "rank all core".
func presentIDs(rows []db.ListNightAttendeesRow) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	return ids
}

// nightStore is the subset of *db.Queries the night read handlers (and the
// movie attach) need; the real *db.Queries satisfies it, so no mock is ever
// written (same pattern as turnStore/pickStore/memberStore). The picker and
// attendee writes take the pool instead and run in night_writes.go.
type nightStore interface {
	GetNight(ctx context.Context, arg db.GetNightParams) (db.Night, error)
	ListNightAttendees(ctx context.Context, arg db.ListNightAttendeesParams) ([]db.ListNightAttendeesRow, error)
	RankGroupTurn(ctx context.Context, arg db.RankGroupTurnParams) ([]db.RankGroupTurnRow, error)
	UpsertMovie(ctx context.Context, arg db.UpsertMovieParams) (uuid.UUID, error)
	SetNightMovie(ctx context.Context, arg db.SetNightMovieParams) error
	ClearNightMovie(ctx context.Context, arg db.ClearNightMovieParams) (uuid.UUID, error)
	DeleteNight(ctx context.Context, arg db.DeleteNightParams) error
	ListNights(ctx context.Context, groupID uuid.UUID) ([]db.Night, error)
	ListNightsAttendees(ctx context.Context, arg db.ListNightsAttendeesParams) ([]db.ListNightsAttendeesRow, error)
}

// recordPickRequest is the JSON body of POST .../nights/{nightId}/pick.
type recordPickRequest struct {
	PickerID string `json:"pickerId"`
}

// updateNightRequest is the JSON body of PATCH .../nights/{nightId}: the whole
// editable Night, which replaces the stored one. A null (or omitted) startTime
// clears it; attendees replace the whole set.
type updateNightRequest struct {
	ScheduledFor string       `json:"scheduledFor"`
	StartTime    *string      `json:"startTime"`
	Attendees    []string     `json:"attendees"`
	Reminders    remindersDTO `json:"reminders"`
}

// nightReminders is a validated remindersDTO.
type nightReminders struct {
	NightBefore    bool
	MorningOf      bool
	TwoHoursBefore bool
	Audience       db.ReminderAudience
}

// nightEdit is a validated updateNightRequest. Attendees is deduped; StartTime
// is not Valid when the Night has none.
type nightEdit struct {
	ScheduledFor pgtype.Date
	StartTime    pgtype.Time
	Attendees    []uuid.UUID
	Reminders    nightReminders
}

// parseReminders requires a known audience. Pure.
func parseReminders(req remindersDTO) (nightReminders, error) {
	audience := db.ReminderAudience(req.Audience)
	if audience != db.ReminderAudienceEveryone && audience != db.ReminderAudiencePicker {
		return nightReminders{}, fmt.Errorf("invalid reminders audience")
	}
	return nightReminders{
		NightBefore:    req.NightBefore,
		MorningOf:      req.MorningOf,
		TwoHoursBefore: req.TwoHoursBefore,
		Audience:       audience,
	}, nil
}

// validateUpdateNightRequest parses the whole edited Night. The picker rule
// needs the stored Night, so editNight checks it. Pure.
func validateUpdateNightRequest(req updateNightRequest) (nightEdit, error) {
	scheduledFor, err := parseScheduledFor(req.ScheduledFor)
	if err != nil {
		return nightEdit{}, err
	}
	startTime, err := parseOptionalStartTime(req.StartTime)
	if err != nil {
		return nightEdit{}, err
	}
	attendees, err := parseAttendeeIDs(req.Attendees)
	if err != nil {
		return nightEdit{}, err
	}
	reminders, err := parseReminders(req.Reminders)
	if err != nil {
		return nightEdit{}, err
	}
	return nightEdit{
		ScheduledFor: scheduledFor,
		StartTime:    startTime,
		Attendees:    attendees,
		Reminders:    reminders,
	}, nil
}

// creditedForRole derives is_credited from the picker's role: a core pick moves
// the rotation (credited); a guest pick never does. Pure.
func creditedForRole(role db.MembershipRole) bool {
	return role == db.MembershipRoleCore
}

// attendeeRoles checks attendees against the FilterGroupMembers rows for them
// and returns each one's role, or errNotMember naming the first attendee (in
// request order) with no membership in the group. Inactive members are
// intentionally allowed: attendance records presence, and the pick order filters
// to active core (RankGroupTurn), so an inactive attendee — like a guest — is
// recorded but never appears in the order. Pure.
func attendeeRoles(attendees []uuid.UUID, members []db.FilterGroupMembersRow) (map[uuid.UUID]db.MembershipRole, error) {
	roles := make(map[uuid.UUID]db.MembershipRole, len(members))
	for _, m := range members {
		roles[m.UserID] = m.Role
	}
	for _, uid := range attendees {
		if _, ok := roles[uid]; !ok {
			return nil, fmt.Errorf("%w: %s", errNotMember, uid)
		}
	}
	return roles, nil
}

// loadNight fetches a night scoped to its group, mapping a miss to 404 and any
// other error to 500. It hands back the row so a caller that needs the night
// itself — not just proof it exists — does not read it a second time. ok=false
// means a response was already written.
func loadNight(w http.ResponseWriter, r *http.Request, store nightStore, gid, nightID uuid.UUID) (nightRow, bool) {
	night, err := store.GetNight(r.Context(), db.GetNightParams{NightID: nightID, GroupID: gid})
	if err != nil {
		storeError(w, gid, "get night", err, http.StatusNotFound, "night not found")
		return nightRow{}, false
	}
	return night, true
}

// writeNight reads a Night (GetNight, the one full-Night read) and its
// attendees and encodes them with the given status, so every handler, read or
// write, answers with the current Night.
func writeNight(w http.ResponseWriter, r *http.Request, store nightStore, gid, nightID uuid.UUID, code int) {
	night, ok := loadNight(w, r, store, gid, nightID)
	if !ok {
		return
	}
	rows, err := store.ListNightAttendees(r.Context(), db.ListNightAttendeesParams{GroupID: gid, NightID: night.ID})
	if err != nil {
		internalError(w, gid, "list night attendees", err)
		return
	}
	respondJSON(w, code, toNightResponse(night, rows), gid, "encode night response")
}

// isUniqueViolation reports whether err is a Postgres unique-constraint
// violation — for nights, uq_night_per_group_date.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// errNightDateTaken is the 409 for create and edit: at most one night per
// group per date.
const errNightDateTaken = "there is already a night on that date"

// createNightHandler serves POST /groups/{groupId}/nights. A night is created
// whole — date, attendees and picker in one request (ADR-0008); unfinished plans
// live on the client, so there is no picker-less night to resume. createNight
// checks every attendee is a member and credits the pick by the picker's role.
// A second night on the same date is a 409.
func createNightHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}
		req, ok := decodeJSON[createNightRequest](w, r)
		if !ok {
			return
		}
		parsed, err := validateCreateNightRequest(req)
		if errors.Is(err, errPickerNotAttendee) {
			writeJSONError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		var nightID uuid.UUID
		err = withTx(r.Context(), pool, func(q *db.Queries) error {
			var err error
			nightID, err = createNight(r.Context(), q, gid, parsed)
			return err
		})
		if err != nil {
			writeNightError(w, gid, "create night", err)
			return
		}
		writeNight(w, r, db.New(pool), gid, nightID, http.StatusCreated)
	}
}

// nightDetailHandler serves GET /groups/{groupId}/nights/{nightId}.
func nightDetailHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := pathGroupNight(w, r)
		if !ok {
			return
		}
		writeNight(w, r, store, gid, nightID, http.StatusOK)
	}
}

// nightTurnHandler serves GET /groups/{groupId}/nights/{nightId}/turn — the core
// pick order over the night's attendees. Reuses RankGroupTurn with the attendee
// IDs as a non-nil present set (empty present = rank nobody), excluding this
// night's own pick so recording (or re-recording) its picker never reshuffles
// the order the picker was chosen from.
func nightTurnHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := pathGroupNight(w, r)
		if !ok {
			return
		}
		ctx := r.Context()
		if _, ok := loadNight(w, r, store, gid, nightID); !ok {
			return
		}
		rows, err := store.ListNightAttendees(ctx, db.ListNightAttendeesParams{GroupID: gid, NightID: nightID})
		if err != nil {
			internalError(w, gid, "list night attendees", err)
			return
		}
		ranked, err := store.RankGroupTurn(ctx, db.RankGroupTurnParams{
			GroupID:      gid,
			ExcludeNight: pgtype.UUID{Bytes: nightID, Valid: true},
			Present:      presentIDs(rows),
		})
		if err != nil {
			internalError(w, gid, "rank group turn", err)
			return
		}
		respondJSON(w, http.StatusOK, toTurnResponses(ranked), gid, "encode turn response")
	}
}

// recordNightPickHandler serves POST /groups/{groupId}/nights/{nightId}/pick.
// It sets (or changes — the correction path) the night's picker. The picker MUST
// be an attendee; is_credited is derived from their role, so a guest pick never
// moves standings. RankGroupTurn recomputes served-counts from the picks table on
// read, so re-recording simply re-attributes — there is no stored counter to fix.
func recordNightPickHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := pathGroupNight(w, r)
		if !ok {
			return
		}
		req, ok := decodeJSON[recordPickRequest](w, r)
		if !ok {
			return
		}
		pickerID, ok := parseUUID(w, req.PickerID, "invalid picker id")
		if !ok {
			return
		}
		err := withTx(r.Context(), pool, func(q *db.Queries) error {
			return recordPick(r.Context(), q, gid, nightID, pickerID)
		})
		if err != nil {
			writeNightError(w, gid, "record pick", err)
			return
		}
		writeNight(w, r, db.New(pool), gid, nightID, http.StatusOK)
	}
}

// updateNightHandler serves PATCH /groups/{groupId}/nights/{nightId}. The body
// {"scheduledFor", "startTime", "attendees", "reminders"} is the whole editable
// Night and replaces it in one transaction, so a rejected edit changes nothing.
// The picker must stay an attendee (422), every attendee must be a member
// (422), and a date another night already holds is a 409. The picker itself is
// changed only by record-pick.
func updateNightHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := pathGroupNight(w, r)
		if !ok {
			return
		}
		req, ok := decodeJSON[updateNightRequest](w, r)
		if !ok {
			return
		}
		edit, err := validateUpdateNightRequest(req)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		err = withTx(r.Context(), pool, func(q *db.Queries) error {
			return editNight(r.Context(), q, gid, nightID, edit)
		})
		if err != nil {
			writeNightError(w, gid, "update night", err)
			return
		}
		writeNight(w, r, db.New(pool), gid, nightID, http.StatusOK)
	}
}

// deleteNightHandler serves DELETE /groups/{groupId}/nights/{nightId}. It
// removes the night and its attendances (CASCADE). Idempotent: deleting a
// missing night still returns 204.
func deleteNightHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := pathGroupNight(w, r)
		if !ok {
			return
		}
		if err := store.DeleteNight(r.Context(), db.DeleteNightParams{
			NightID: nightID,
			GroupID: gid,
		}); err != nil {
			internalError(w, gid, "delete night", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
