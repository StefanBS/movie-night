package main

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// createNightRequest is the JSON body of POST /groups/{groupId}/nights.
type createNightRequest struct {
	ScheduledFor string     `json:"scheduledFor"`
	StartTime    *string    `json:"startTime"`
	Attendees    []string   `json:"attendees"`
	PickerID     string     `json:"pickerId"`
	Repeat       *repeatDTO `json:"repeat"`
}

// parsedCreateNight is a validated createNightRequest. Attendees is deduped,
// first-seen order, and always contains Picker. Repeat is nil for a one-off.
type parsedCreateNight struct {
	ScheduledFor pgtype.Date
	StartTime    pgtype.Time
	Attendees    []uuid.UUID
	Picker       uuid.UUID
	Repeat       *repeatRule
}

// errWatchedDateAhead is the 422 for recording a Night that hasn't happened,
// or moving a Watched Night to a date that hasn't (ADR-0013).
var errWatchedDateAhead = errors.New("night is dated too far ahead to be recorded as watched")

// recordableAsWatched reports whether a Night on scheduledFor can be (or stay)
// recorded as watched at now: it is dated no later than the day after now's
// UTC date. There is no group timezone, and every zone's today is at most one
// day ahead of the UTC date (UTC+14), so a Night dated today anywhere passes,
// at the cost of letting a Night be recorded up to a day early (ADR-0013).
// Pure.
func recordableAsWatched(scheduledFor pgtype.Date, now time.Time) bool {
	return !scheduledFor.Time.After(utcDay(now, 1))
}

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
	t, err := time.Parse(dateLayout, raw)
	if err != nil {
		return pgtype.Date{}, fmt.Errorf("invalid scheduledFor")
	}
	return pgtype.Date{Time: t, Valid: true}, nil
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

// startClock is a start time as a clock reading on the zero day, for
// formatting or for its hour and minute. Pure.
func startClock(t pgtype.Time) time.Time {
	return time.Time{}.Add(time.Duration(t.Microseconds) * time.Microsecond)
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
	s := startClock(t).Format(startTimeLayout)
	return &s
}

// validateCreateNightRequest validates a decoded body: scheduledFor must be an
// ISO (YYYY-MM-DD) date, startTime (optional) an HH:MM time, every attendee and
// the picker must be UUIDs, and a repeat (optional) must match the date. That
// the picker attends is the schema's rule (fk_night_picker_attends). Pure —
// no DB, no clock.
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
	repeat, err := parseRepeat(req.Repeat, scheduledFor.Time)
	if err != nil {
		return parsedCreateNight{}, err
	}
	return parsedCreateNight{
		ScheduledFor: scheduledFor,
		StartTime:    startTime,
		Attendees:    attendees,
		Picker:       picker,
		Repeat:       repeat,
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
// night has a picker (ADR-0008); Movie is null until a film is attached, and
// WatchedAt (RFC 3339) until the night is recorded as watched (ADR-0012), and
// Repeat while it doesn't repeat (ADR-0014).
type nightResponse struct {
	ID           string       `json:"id"`
	ScheduledFor string       `json:"scheduledFor"`
	StartTime    *string      `json:"startTime"`
	PickerID     string       `json:"pickerId"`
	Movie        *movieDTO    `json:"movie"`
	Attendees    []attendee   `json:"attendees"`
	Reminders    remindersDTO `json:"reminders"`
	WatchedAt    *string      `json:"watchedAt"`
	Repeat       *repeatDTO   `json:"repeat"`
}

// newNightResponse assembles the night DTO from a night row and its attendees.
// The detail and list paths both build through here, so a new field is added
// once. Attendees is normalized to non-nil so an empty list encodes as [] rather than null.
func newNightResponse(night db.FullNight, atts []attendee) nightResponse {
	if atts == nil {
		atts = []attendee{}
	}
	return nightResponse{
		ID:           night.ID.String(),
		ScheduledFor: formatDay(night.ScheduledFor.Time),
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
		WatchedAt: formatTimestampWire(night.WatchedAt),
		Repeat:    toRepeatDTO(repeatFromColumns(night.RepeatFreq, night.RepeatIntervalWeeks, night.RepeatWeekOfMonth)),
	}
}

// formatTimestampWire is a nullable timestamp as the wire carries it: RFC 3339
// in UTC, or nil when unset. Pure.
func formatTimestampWire(t pgtype.Timestamptz) *string {
	if !t.Valid {
		return nil
	}
	s := t.Time.UTC().Format(time.RFC3339)
	return &s
}

// movieDTOFromCols builds the movie DTO from a night row's nullable LEFT JOIN
// columns; nil when the night has no movie attached. It is the only movie-row
// mapper, so a new movie field is added here and to the full_nights view.
func movieDTOFromCols(row db.FullNight) *movieDTO {
	if !row.MovieTmdbID.Valid {
		return nil
	}
	return &movieDTO{
		TMDBID:         row.MovieTmdbID.Int32,
		Title:          row.MovieTitle.String,
		ReleaseYear:    nullableInt32(row.MovieReleaseYear),
		PosterURL:      posterURLPtr(row.MoviePosterPath),
		Genres:         genresOrEmpty(row.MovieGenres),
		RuntimeMinutes: nullableInt32(row.MovieRuntimeMinutes),
	}
}

// groupAttendees buckets attendee rows by their night (night_id), preserving the
// query's role-then-name order within each night.
func groupAttendees(rows []db.ListAttendeesRow) map[uuid.UUID][]attendee {
	byNight := make(map[uuid.UUID][]attendee)
	for _, r := range rows {
		byNight[r.NightID] = append(byNight[r.NightID], attendee{ID: r.ID.String(), Name: r.Name, Role: string(r.Role)})
	}
	return byNight
}

// toNightResponses assembles the ordered nights list from night rows and the
// attendees grouped by night. A Night missing from byNight has none, which
// newNightResponse normalizes to [].
func toNightResponses(rows []db.FullNight, byNight map[uuid.UUID][]attendee) []nightResponse {
	out := make([]nightResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, newNightResponse(row, byNight[row.ID]))
	}
	return out
}

// listNightsHandler serves GET /groups/{groupId}/nights — every night of the
// group, past and upcoming, newest first. Two set-based queries (the nights, then all
// of their attendees in one shot) keep it constant in the number of nights.
func listNightsHandler(store *db.Queries) http.HandlerFunc {
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
		attRows, err := store.ListAttendees(ctx, db.ListAttendeesParams{GroupID: gid})
		if err != nil {
			internalError(w, gid, "list attendees", err)
			return
		}
		respondJSON(w, http.StatusOK, toNightResponses(rows, groupAttendees(attRows)))
	}
}

// presentIDs extracts attendee user IDs as a NON-NIL (possibly empty) slice to
// pass as RankGroupTurn's present set. Empty (not nil) makes the ranking exclude
// everyone — distinct from nil, which RankGroupTurn treats as "rank all core".
func presentIDs(rows []db.ListAttendeesRow) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	return ids
}

// updateNightRequest is the JSON body of PATCH .../nights/{nightId}: the whole
// editable Night, which replaces the stored one. A null (or omitted) startTime
// clears it; attendees replace the whole set, and a null (or omitted) repeat
// ends the series (ADR-0014). Two fields are optional: a
// pickerId changes the picker in the same edit, and watched: true records the
// Night (ADR-0012). Omitted, they leave the picker and the record as they are;
// there is no un-recording.
type updateNightRequest struct {
	ScheduledFor string       `json:"scheduledFor"`
	StartTime    *string      `json:"startTime"`
	Attendees    []string     `json:"attendees"`
	Reminders    remindersDTO `json:"reminders"`
	Repeat       *repeatDTO   `json:"repeat"`
	PickerID     *string      `json:"pickerId"`
	Watched      bool         `json:"watched"`
}

// nightEdit is a validated updateNightRequest. Attendees is deduped; StartTime
// is not Valid when the Night has none, and Picker not Valid when the edit
// keeps the stored picker. Repeat is nil when the Night doesn't repeat.
type nightEdit struct {
	ScheduledFor pgtype.Date
	StartTime    pgtype.Time
	Attendees    []uuid.UUID
	Reminders    remindersDTO
	Repeat       *repeatRule
	Picker       pgtype.UUID
	Watched      bool
}

// validateReminders requires a known audience. Pure.
func validateReminders(req remindersDTO) error {
	audience := db.ReminderAudience(req.Audience)
	if audience != db.ReminderAudienceEveryone && audience != db.ReminderAudiencePicker {
		return fmt.Errorf("invalid reminders audience")
	}
	return nil
}

// validateUpdateNightRequest parses the whole edited Night. Pure.
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
	if err := validateReminders(req.Reminders); err != nil {
		return nightEdit{}, err
	}
	repeat, err := parseRepeat(req.Repeat, scheduledFor.Time)
	if err != nil {
		return nightEdit{}, err
	}
	var picker pgtype.UUID
	if req.PickerID != nil {
		id, err := uuid.Parse(*req.PickerID)
		if err != nil {
			return nightEdit{}, fmt.Errorf("invalid picker id")
		}
		picker = pgtype.UUID{Bytes: id, Valid: true}
	}
	return nightEdit{
		ScheduledFor: scheduledFor,
		StartTime:    startTime,
		Attendees:    attendees,
		Reminders:    req.Reminders,
		Repeat:       repeat,
		Picker:       picker,
		Watched:      req.Watched,
	}, nil
}

// loadNight fetches a night scoped to its group, mapping a miss to 404 and any
// other error to 500. It hands back the row so a caller that needs the night
// itself — not just proof it exists — does not read it a second time. ok=false
// means a response was already written.
func loadNight(w http.ResponseWriter, r *http.Request, store *db.Queries, gid, nightID uuid.UUID) (db.FullNight, bool) {
	night, err := store.GetNight(r.Context(), db.GetNightParams{NightID: nightID, GroupID: gid})
	if err != nil {
		storeError(w, gid, "get night", err, http.StatusNotFound, "night not found")
		return db.FullNight{}, false
	}
	return night, true
}

// writeNight reads a Night (GetNight, the one full-Night read) and its
// attendees and encodes them with the given status, so every handler, read or
// write, answers with the current Night.
func writeNight(w http.ResponseWriter, r *http.Request, store *db.Queries, gid, nightID uuid.UUID, code int) {
	night, ok := loadNight(w, r, store, gid, nightID)
	if !ok {
		return
	}
	rows, err := store.ListAttendees(r.Context(), db.ListAttendeesParams{GroupID: gid, NightID: pgtype.UUID{Bytes: night.ID, Valid: true}})
	if err != nil {
		internalError(w, gid, "list night attendees", err)
		return
	}
	respondJSON(w, code, newNightResponse(night, groupAttendees(rows)[night.ID]))
}

// createNightHandler serves POST /groups/{groupId}/nights. A night is created
// whole — date, attendees and picker in one request (ADR-0008); unfinished plans
// live on the client, so there is no picker-less night to resume. A picker who
// doesn't attend, or a non-member, is a 422 and a second night on the same
// date a 409 (writeNightError).
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
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		nightID, err := withTxResult(r.Context(), pool, func(q *db.Queries) (uuid.UUID, error) {
			return createNight(r.Context(), q, gid, parsed)
		})
		if err != nil {
			writeNightError(w, gid, "create night", err)
			return
		}
		writeNight(w, r, db.New(pool), gid, nightID, http.StatusCreated)
	}
}

// nightDetailHandler serves GET /groups/{groupId}/nights/{nightId}.
func nightDetailHandler(store *db.Queries) http.HandlerFunc {
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
// the order the picker was chosen from. An optional `present=<uuid>,…` ranks
// that draft attendee set instead of the stored one (the "We watched it" flow
// confirms who came before saving); blank means the stored attendees.
func nightTurnHandler(store *db.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := pathGroupNight(w, r)
		if !ok {
			return
		}
		present, err := parsePresent(r.URL.Query().Get("present"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid present id")
			return
		}
		ctx := r.Context()
		if _, ok := loadNight(w, r, store, gid, nightID); !ok {
			return
		}
		if present == nil {
			rows, err := store.ListAttendees(ctx, db.ListAttendeesParams{GroupID: gid, NightID: pgtype.UUID{Bytes: nightID, Valid: true}})
			if err != nil {
				internalError(w, gid, "list night attendees", err)
				return
			}
			present = presentIDs(rows)
		}
		ranked, err := store.RankGroupTurn(ctx, db.RankGroupTurnParams{
			GroupID:      gid,
			ExcludeNight: pgtype.UUID{Bytes: nightID, Valid: true},
			Present:      present,
		})
		if err != nil {
			internalError(w, gid, "rank group turn", err)
			return
		}
		respondJSON(w, http.StatusOK, toTurnResponses(ranked))
	}
}

// updateNightHandler serves PATCH /groups/{groupId}/nights/{nightId}. The body
// {"scheduledFor", "startTime", "attendees", "reminders"} is the whole editable
// Night and replaces it in one transaction, so a rejected edit changes nothing.
// The optional pickerId and watched: true change the picker and record the
// Night in the same edit (ADR-0012). The picker must stay an attendee (422),
// every attendee must be a member (422), a Night can only be recorded once it
// has a film (422), a Watched Night (or one being recorded) can't be dated
// past recordableAsWatched's bound (422, ADR-0013), a Watched Night can't
// repeat (422), and a date another night already holds is a 409. Recording a
// repeating Night opens the next Night in its series (ADR-0014).
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
			return editNight(r.Context(), q, gid, nightID, edit, time.Now())
		})
		if err != nil {
			writeNightError(w, gid, "update night", err)
			return
		}
		writeNight(w, r, db.New(pool), gid, nightID, http.StatusOK)
	}
}

// deleteNightHandler serves DELETE /groups/{groupId}/nights/{nightId}
// ("Cancel this night"). It removes the night and its attendances (CASCADE);
// cancelling a repeating Night moves its series on to the next date in the
// same transaction (ADR-0014). Idempotent: deleting a missing night still
// returns 204.
func deleteNightHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := pathGroupNight(w, r)
		if !ok {
			return
		}
		err := withTx(r.Context(), pool, func(q *db.Queries) error {
			return cancelNight(r.Context(), q, gid, nightID, time.Now())
		})
		if err != nil {
			writeNightError(w, gid, "delete night", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
