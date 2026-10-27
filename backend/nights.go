package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// createNightRequest is the JSON body of POST /groups/{groupId}/nights.
type createNightRequest struct {
	ScheduledFor string   `json:"scheduledFor"`
	Attendees    []string `json:"attendees"`
	PickerID     string   `json:"pickerId"`
}

// parsedCreateNight is a validated createNightRequest. Attendees is deduped,
// first-seen order, and always contains Picker.
type parsedCreateNight struct {
	ScheduledFor pgtype.Date
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

// validateCreateNightRequest validates a decoded body: scheduledFor must be an
// ISO (YYYY-MM-DD) date, every attendee and the picker must be UUIDs, and the
// picker must be among the attendees (errPickerNotAttendee). Pure — no DB, no clock.
func validateCreateNightRequest(req createNightRequest) (parsedCreateNight, error) {
	scheduledFor, err := parseScheduledFor(req.ScheduledFor)
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
	NightBefore bool   `json:"nightBefore"`
	MorningOf   bool   `json:"morningOf"`
	Audience    string `json:"audience"`
}

// nightResponse is the JSON shape for a night and its current attendees. Every
// night has a picker (ADR-0008); Movie is null until a film is attached.
type nightResponse struct {
	ID           string       `json:"id"`
	ScheduledFor string       `json:"scheduledFor"`
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
		PickerID:     night.PickerID.String(),
		Movie:        movieDTOFromCols(night),
		Attendees:    atts,
		Reminders: remindersDTO{
			NightBefore: night.RemindNightBefore,
			MorningOf:   night.RemindMorningOf,
			Audience:    string(night.RemindAudience),
		},
	}
}

// nightRow is a night plus its attached movie's LEFT JOIN columns: the one shape
// every night query returns. sqlc generates an identical row type per query and
// each converts to this one (nightRow(row)), so a select list that drifts from
// the others fails to compile rather than silently dropping a field.
type nightRow = db.GetNightRow

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
func toNightResponses(rows []db.ListNightsRow, byNight map[uuid.UUID][]attendee) []nightResponse {
	out := make([]nightResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, newNightResponse(nightRow(row), byNight[row.ID]))
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

// nightStore is the subset of *db.Queries the night handlers need; the real
// *db.Queries satisfies it, so no mock is ever written (same pattern as
// turnStore/pickStore/memberStore).
type nightStore interface {
	CreateNight(ctx context.Context, arg db.CreateNightParams) (db.CreateNightRow, error)
	GetNight(ctx context.Context, arg db.GetNightParams) (db.GetNightRow, error)
	ListNightAttendees(ctx context.Context, arg db.ListNightAttendeesParams) ([]db.ListNightAttendeesRow, error)
	FilterGroupMembers(ctx context.Context, arg db.FilterGroupMembersParams) ([]db.FilterGroupMembersRow, error)
	RankGroupTurn(ctx context.Context, arg db.RankGroupTurnParams) ([]db.RankGroupTurnRow, error)
	SetNightPicker(ctx context.Context, arg db.SetNightPickerParams) (db.SetNightPickerRow, error)
	UpsertMovie(ctx context.Context, arg db.UpsertMovieParams) (uuid.UUID, error)
	SetNightMovie(ctx context.Context, arg db.SetNightMovieParams) (db.SetNightMovieRow, error)
	ClearNightMovie(ctx context.Context, arg db.ClearNightMovieParams) (db.ClearNightMovieRow, error)
	DeleteNight(ctx context.Context, arg db.DeleteNightParams) error
	ListNights(ctx context.Context, groupID uuid.UUID) ([]db.ListNightsRow, error)
	ListNightsAttendees(ctx context.Context, arg db.ListNightsAttendeesParams) ([]db.ListNightsAttendeesRow, error)
}

// recordPickRequest is the JSON body of POST .../nights/{nightId}/pick.
type recordPickRequest struct {
	PickerID string `json:"pickerId"`
}

// updateNightRequest is the JSON body of PATCH .../nights/{nightId}. An omitted
// field is left unchanged; attendees and reminders, when sent, replace the
// whole set.
type updateNightRequest struct {
	ScheduledFor *string           `json:"scheduledFor"`
	Attendees    *[]string         `json:"attendees"`
	Reminders    *remindersRequest `json:"reminders"`
}

// remindersRequest is the wire form of remindersDTO with every field a pointer,
// so an omitted field is rejected rather than read as false.
type remindersRequest struct {
	NightBefore *bool   `json:"nightBefore"`
	MorningOf   *bool   `json:"morningOf"`
	Audience    *string `json:"audience"`
}

// nightReminders is a validated remindersRequest.
type nightReminders struct {
	NightBefore bool
	MorningOf   bool
	Audience    db.ReminderAudience
}

// parsedUpdateNight is a validated updateNightRequest. A nil field is
// unchanged; Attendees is deduped, and non-nil (possibly empty) when sent.
type parsedUpdateNight struct {
	ScheduledFor *pgtype.Date
	Attendees    []uuid.UUID
	Reminders    *nightReminders
}

// parseReminders requires all three settings and a known audience. Pure.
func parseReminders(req remindersRequest) (nightReminders, error) {
	if req.NightBefore == nil || req.MorningOf == nil || req.Audience == nil {
		return nightReminders{}, fmt.Errorf("reminders needs nightBefore, morningOf and audience")
	}
	audience := db.ReminderAudience(*req.Audience)
	if audience != db.ReminderAudienceEveryone && audience != db.ReminderAudiencePicker {
		return nightReminders{}, fmt.Errorf("invalid reminders audience")
	}
	return nightReminders{NightBefore: *req.NightBefore, MorningOf: *req.MorningOf, Audience: audience}, nil
}

// validateUpdateNightRequest parses the fields that were sent and rejects a
// body that changes nothing. The picker rule needs the stored Night, so it is
// checked in the handler. Pure.
func validateUpdateNightRequest(req updateNightRequest) (parsedUpdateNight, error) {
	if req.ScheduledFor == nil && req.Attendees == nil && req.Reminders == nil {
		return parsedUpdateNight{}, fmt.Errorf("nothing to update")
	}
	var parsed parsedUpdateNight
	if req.ScheduledFor != nil {
		d, err := parseScheduledFor(*req.ScheduledFor)
		if err != nil {
			return parsedUpdateNight{}, err
		}
		parsed.ScheduledFor = &d
	}
	if req.Attendees != nil {
		ids, err := parseAttendeeIDs(*req.Attendees)
		if err != nil {
			return parsedUpdateNight{}, err
		}
		parsed.Attendees = ids
	}
	if req.Reminders != nil {
		rem, err := parseReminders(*req.Reminders)
		if err != nil {
			return parsedUpdateNight{}, err
		}
		parsed.Reminders = &rem
	}
	return parsed, nil
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

// writeNightDTO encodes an ALREADY-LOADED night (its movie columns included)
// plus its attendees with the given status, so the client always gets the
// current night back. Taking the row rather than an id is what lets the write
// handlers pass on what their RETURNING clause already gave them: no endpoint
// reads the same picks row twice, and none reads the movie separately.
func writeNightDTO(w http.ResponseWriter, r *http.Request, store nightStore, gid uuid.UUID, night nightRow, code int) {
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
// live on the client, so there is no picker-less night to resume. Every attendee
// must be a member, checked in one query BEFORE the write; the night and its
// attendances are then inserted in one statement. is_credited is derived from the picker's role,
// as on record-pick. A second night on the same date is a 409.
func createNightHandler(store nightStore) http.HandlerFunc {
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
		members, err := store.FilterGroupMembers(r.Context(), db.FilterGroupMembersParams{GroupID: gid, UserIds: parsed.Attendees})
		if err != nil {
			internalError(w, gid, "filter group members", err)
			return
		}
		roles, err := attendeeRoles(parsed.Attendees, members)
		if err != nil {
			writeJSONError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		row, err := store.CreateNight(r.Context(), db.CreateNightParams{
			GroupID:      gid,
			ScheduledFor: parsed.ScheduledFor,
			PickerID:     parsed.Picker,
			IsCredited:   creditedForRole(roles[parsed.Picker]),
			Attendees:    parsed.Attendees,
		})
		if isUniqueViolation(err) {
			writeJSONError(w, http.StatusConflict, errNightDateTaken)
			return
		}
		if err != nil {
			internalError(w, gid, "create night", err)
			return
		}
		writeNightDTO(w, r, store, gid, nightRow(row), http.StatusCreated)
	}
}

// nightDetailHandler serves GET /groups/{groupId}/nights/{nightId}.
func nightDetailHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := pathGroupNight(w, r)
		if !ok {
			return
		}
		night, ok := loadNight(w, r, store, gid, nightID)
		if !ok {
			return
		}
		writeNightDTO(w, r, store, gid, night, http.StatusOK)
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
func recordNightPickHandler(store nightStore) http.HandlerFunc {
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
		// Existence check only — the 404 must precede the 422 below, and
		// SetNightPicker hands back the post-write row for the response.
		if _, ok := loadNight(w, r, store, gid, nightID); !ok {
			return
		}
		rows, err := store.ListNightAttendees(r.Context(), db.ListNightAttendeesParams{GroupID: gid, NightID: nightID})
		if err != nil {
			internalError(w, gid, "list night attendees", err)
			return
		}
		var role db.MembershipRole
		found := false
		for _, row := range rows {
			if row.ID == pickerID {
				role, found = row.Role, true
				break
			}
		}
		if !found {
			writeJSONError(w, http.StatusUnprocessableEntity, errPickerNotAttendee.Error())
			return
		}
		night, err := store.SetNightPicker(r.Context(), db.SetNightPickerParams{
			NightID:    nightID,
			GroupID:    gid,
			PickerID:   pickerID,
			IsCredited: creditedForRole(role),
		})
		if err != nil {
			internalError(w, gid, "set night picker", err)
			return
		}
		writeNightDTO(w, r, store, gid, nightRow(night), http.StatusOK)
	}
}

// updateNightHandler serves PATCH /groups/{groupId}/nights/{nightId}. Body
// {"scheduledFor"?, "attendees"?, "reminders"?} edits the Night's date and
// replaces its attendee set and reminder settings in one transaction, so a
// rejected edit changes nothing. The
// picker must stay an attendee (422), every attendee must be a member (422),
// and a date another night already holds is a 409. The picker itself is
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
		parsed, err := validateUpdateNightRequest(req)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		var night nightRow
		err = withTx(r.Context(), pool, func(q *db.Queries) error {
			var err error
			night, err = editNight(r.Context(), q, gid, nightID, parsed)
			return err
		})
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			writeJSONError(w, http.StatusNotFound, "night not found")
		case errors.Is(err, errPickerNotAttendee), errors.Is(err, errNotMember):
			writeJSONError(w, http.StatusUnprocessableEntity, err.Error())
		case isUniqueViolation(err):
			writeJSONError(w, http.StatusConflict, errNightDateTaken)
		case err != nil:
			internalError(w, gid, "update night", err)
		default:
			writeNightDTO(w, r, db.New(pool), gid, night, http.StatusOK)
		}
	}
}

// editNight applies a validated edit inside the caller's transaction. It locks
// the Night first (a miss is pgx.ErrNoRows), so a concurrent record-pick can't
// move the picker between the picker check and the write. A taken date fails on
// the last statement, after the attendee writes; the rollback undoes them.
func editNight(ctx context.Context, q *db.Queries, gid, nightID uuid.UUID, edit parsedUpdateNight) (nightRow, error) {
	locked, err := q.GetNightForUpdate(ctx, db.GetNightForUpdateParams{NightID: nightID, GroupID: gid})
	if err != nil {
		return nightRow{}, err
	}
	night := nightRow(locked)
	if edit.Attendees != nil {
		if !slices.Contains(edit.Attendees, night.PickerID) {
			return nightRow{}, errPickerNotAttendee
		}
		members, err := q.FilterGroupMembers(ctx, db.FilterGroupMembersParams{GroupID: gid, UserIds: edit.Attendees})
		if err != nil {
			return nightRow{}, err
		}
		if _, err := attendeeRoles(edit.Attendees, members); err != nil {
			return nightRow{}, err
		}
		if err := q.RemoveAttendeesNotIn(ctx, db.RemoveAttendeesNotInParams{PickID: nightID, Keep: edit.Attendees}); err != nil {
			return nightRow{}, err
		}
		if err := q.AddAttendees(ctx, db.AddAttendeesParams{PickID: nightID, UserIds: edit.Attendees}); err != nil {
			return nightRow{}, err
		}
	}
	if edit.Reminders != nil {
		updated, err := q.UpdateNightReminders(ctx, db.UpdateNightRemindersParams{
			NightID:           nightID,
			GroupID:           gid,
			RemindNightBefore: edit.Reminders.NightBefore,
			RemindMorningOf:   edit.Reminders.MorningOf,
			RemindAudience:    edit.Reminders.Audience,
		})
		if err != nil {
			return nightRow{}, err
		}
		night = nightRow(updated)
	}
	if edit.ScheduledFor != nil {
		updated, err := q.UpdateNightDate(ctx, db.UpdateNightDateParams{
			NightID:      nightID,
			GroupID:      gid,
			ScheduledFor: *edit.ScheduledFor,
		})
		if err != nil {
			return nightRow{}, err
		}
		night = nightRow(updated)
	}
	return night, nil
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
