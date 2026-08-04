package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// createNightRequest is the JSON body of POST /groups/{groupId}/nights.
type createNightRequest struct {
	ScheduledFor string   `json:"scheduledFor"`
	Attendees    []string `json:"attendees"`
}

// parsedCreateNight is a validated createNightRequest. Attendees is deduped,
// first-seen order, and always non-nil (possibly empty).
type parsedCreateNight struct {
	ScheduledFor pgtype.Date
	Attendees    []uuid.UUID
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
// field in the error. Shared by create and the date-edit PATCH so the two paths
// can't disagree on the accepted format. Pure.
func parseScheduledFor(raw string) (pgtype.Date, error) {
	d, err := parseDate(raw)
	if err != nil {
		return pgtype.Date{}, fmt.Errorf("invalid scheduledFor")
	}
	return d, nil
}

// validateCreateNightRequest validates a decoded body: scheduledFor must be an
// ISO (YYYY-MM-DD) date and every attendee must be a UUID. Pure — no DB, no clock.
func validateCreateNightRequest(req createNightRequest) (parsedCreateNight, error) {
	scheduledFor, err := parseScheduledFor(req.ScheduledFor)
	if err != nil {
		return parsedCreateNight{}, err
	}
	attendees, err := parseAttendeeIDs(req.Attendees)
	if err != nil {
		return parsedCreateNight{}, err
	}
	return parsedCreateNight{
		ScheduledFor: scheduledFor,
		Attendees:    attendees,
	}, nil
}

// attendee is one person recorded as present on a night.
type attendee struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

// nightResponse is the JSON shape for a night and its current attendees.
// PickerID is nil (renders as null) until a pick is recorded.
type nightResponse struct {
	ID           string     `json:"id"`
	ScheduledFor string     `json:"scheduledFor"`
	PickerID     *string    `json:"pickerId"`
	Movie        *movieDTO  `json:"movie"`
	Attendees    []attendee `json:"attendees"`
}

// pickerIDPtr renders a nullable picker as *string: nil (JSON null) when the
// night is still open, the canonical UUID string once a pick is recorded.
func pickerIDPtr(u pgtype.UUID) *string {
	if !u.Valid {
		return nil
	}
	s := uuid.UUID(u.Bytes).String()
	return &s
}

// toAttendee builds the attendee DTO. The single-night query and the grouped
// history query return different row types carrying the same three fields, so
// both funnel through here and their JSON cannot drift apart.
func toAttendee(id uuid.UUID, name string, role db.MembershipRole) attendee {
	return attendee{ID: id.String(), Name: name, Role: string(role)}
}

// newNightResponse assembles the night DTO from its parts. The detail path and
// the history-list path read different row shapes but both build through here,
// so a new field is added once. Attendees is normalized to non-nil so an empty
// list encodes as [] rather than null.
func newNightResponse(id uuid.UUID, scheduledFor pgtype.Date, pickerID pgtype.UUID, movie *movieDTO, atts []attendee) nightResponse {
	if atts == nil {
		atts = []attendee{}
	}
	return nightResponse{
		ID:           id.String(),
		ScheduledFor: formatDate(scheduledFor),
		PickerID:     pickerIDPtr(pickerID),
		Movie:        movie,
		Attendees:    atts,
	}
}

// toNightResponse maps a night row + attendee rows to the night DTO.
func toNightResponse(p db.Pick, rows []db.ListNightAttendeesRow, movie *db.Movie) nightResponse {
	attendees := make([]attendee, 0, len(rows))
	for _, r := range rows {
		attendees = append(attendees, toAttendee(r.ID, r.Name, r.Role))
	}
	return newNightResponse(p.ID, p.ScheduledFor, p.PickerID, movieDTOPtr(movie), attendees)
}

// movieDTOFromCols builds the movie DTO from the nullable LEFT JOIN columns of a
// ListRecordedNights row; nil when the night has no movie attached.
func movieDTOFromCols(row db.ListRecordedNightsRow) *movieDTO {
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

// toNightResponses assembles the ordered history list from recorded-night rows
// and the attendees grouped by night. A nil byNight (no night had attendees) is
// fine: reads from a nil map yield the zero value, which newNightResponse
// normalizes to [].
func toNightResponses(rows []db.ListRecordedNightsRow, byNight map[uuid.UUID][]attendee) []nightResponse {
	out := make([]nightResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, newNightResponse(row.ID, row.ScheduledFor, row.PickerID, movieDTOFromCols(row), byNight[row.ID]))
	}
	return out
}

// listNightsHandler serves GET /groups/{groupId}/nights — the group's recorded
// nights (picker set), newest first. Two set-based queries (the nights, then all
// of their attendees in one shot) keep it constant in the number of nights.
func listNightsHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}
		ctx := r.Context()
		rows, err := store.ListRecordedNights(ctx, gid)
		if err != nil {
			internalError(w, gid, "list recorded nights", err)
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
	CreateNight(ctx context.Context, arg db.CreateNightParams) (db.Pick, error)
	GetNight(ctx context.Context, arg db.GetNightParams) (db.Pick, error)
	GetCurrentNight(ctx context.Context, groupID uuid.UUID) (db.Pick, error)
	GetOpenNight(ctx context.Context, groupID uuid.UUID) (db.Pick, error)
	AddAttendee(ctx context.Context, arg db.AddAttendeeParams) error
	RemoveAttendee(ctx context.Context, arg db.RemoveAttendeeParams) error
	ListNightAttendees(ctx context.Context, arg db.ListNightAttendeesParams) ([]db.ListNightAttendeesRow, error)
	GetGroupMember(ctx context.Context, arg db.GetGroupMemberParams) (db.GetGroupMemberRow, error)
	RankGroupTurn(ctx context.Context, arg db.RankGroupTurnParams) ([]db.RankGroupTurnRow, error)
	SetNightPicker(ctx context.Context, arg db.SetNightPickerParams) (db.Pick, error)
	GetMovie(ctx context.Context, id uuid.UUID) (db.Movie, error)
	UpsertMovie(ctx context.Context, arg db.UpsertMovieParams) (db.Movie, error)
	SetNightMovie(ctx context.Context, arg db.SetNightMovieParams) (db.Pick, error)
	ClearNightMovie(ctx context.Context, arg db.ClearNightMovieParams) (db.Pick, error)
	UpdateNightDate(ctx context.Context, arg db.UpdateNightDateParams) (db.Pick, error)
	DeleteNight(ctx context.Context, arg db.DeleteNightParams) error
	ListRecordedNights(ctx context.Context, groupID uuid.UUID) ([]db.ListRecordedNightsRow, error)
	ListNightsAttendees(ctx context.Context, arg db.ListNightsAttendeesParams) ([]db.ListNightsAttendeesRow, error)
}

// attendeeRequest is the JSON body of POST .../nights/{nightId}/attendees.
type attendeeRequest struct {
	UserID string `json:"userId"`
}

// recordPickRequest is the JSON body of POST .../nights/{nightId}/pick.
type recordPickRequest struct {
	PickerID string `json:"pickerId"`
}

// updateNightDateRequest is the JSON body of PATCH .../nights/{nightId}.
type updateNightDateRequest struct {
	ScheduledFor string `json:"scheduledFor"`
}

// validateUpdateNightDateRequest parses scheduledFor as YYYY-MM-DD. Pure.
func validateUpdateNightDateRequest(req updateNightDateRequest) (pgtype.Date, error) {
	return parseScheduledFor(req.ScheduledFor)
}

// creditedForRole derives is_credited from the picker's role: a core pick moves
// the rotation (credited); a guest pick never does. Pure.
func creditedForRole(role db.MembershipRole) bool {
	return role == db.MembershipRoleCore
}

// loadNight fetches a night scoped to its group, mapping a miss to 404 and any
// other error to 500. It hands back the row so a caller that needs the night
// itself — not just proof it exists — does not read it a second time. ok=false
// means a response was already written.
func loadNight(w http.ResponseWriter, r *http.Request, store nightStore, gid, nightID uuid.UUID) (db.Pick, bool) {
	night, err := store.GetNight(r.Context(), db.GetNightParams{NightID: nightID, GroupID: gid})
	if err != nil {
		storeError(w, gid, "get night", err, http.StatusNotFound, "night not found")
		return db.Pick{}, false
	}
	return night, true
}

// writeNightDTO encodes an ALREADY-LOADED night plus its attendees (and its
// attached movie, if any) with the given status, so the client always gets the
// current night back. Taking the row rather than an id is what lets the write
// handlers pass on what their RETURNING clause already gave them: no endpoint
// reads the same picks row twice.
func writeNightDTO(w http.ResponseWriter, r *http.Request, store nightStore, gid uuid.UUID, night db.Pick, code int) {
	var movie *db.Movie
	if night.MovieID.Valid {
		m, err := store.GetMovie(r.Context(), uuid.UUID(night.MovieID.Bytes))
		if err != nil {
			internalError(w, gid, "get movie", err)
			return
		}
		movie = &m
	}
	rows, err := store.ListNightAttendees(r.Context(), db.ListNightAttendeesParams{GroupID: gid, NightID: night.ID})
	if err != nil {
		internalError(w, gid, "list night attendees", err)
		return
	}
	respondJSON(w, code, toNightResponse(night, rows, movie), gid, "encode night response")
}

// resumeOpenNight writes the group's already-open night (200) when there is one.
// handled=false means there is none and nothing was written, so the caller
// should go ahead and create it. Both the pre-check and the lost-race recovery
// in createNightHandler go through here, so "resume, never a second open night"
// is stated once.
func resumeOpenNight(w http.ResponseWriter, r *http.Request, store nightStore, gid uuid.UUID) (handled bool) {
	existing, err := store.GetOpenNight(r.Context(), gid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false
		}
		internalError(w, gid, "get open night", err)
		return true
	}
	writeNightDTO(w, r, store, gid, existing, http.StatusOK)
	return true
}

// requireMember validates that uid has a membership in the group (active OR
// inactive), writing a 422 on a miss and 500 on any other error. Inactive
// members are intentionally allowed: attendance records presence, and the pick
// order filters to active core (RankGroupTurn), so an inactive attendee — like a
// guest — is recorded but never appears in the order. ok=false means a response
// was already written.
func requireMember(w http.ResponseWriter, r *http.Request, store nightStore, gid, uid uuid.UUID) bool {
	if _, err := store.GetGroupMember(r.Context(), db.GetGroupMemberParams{GroupID: gid, UserID: uid}); err != nil {
		storeError(w, gid, "get group member", err, http.StatusUnprocessableEntity, "attendee is not a member of this group")
		return false
	}
	return true
}

// createNightHandler serves POST /groups/{groupId}/nights. It starts a NEW open
// night — a picks row with picker_id NULL; a pick is recorded onto it later via
// .../pick. A group may have at most one open night at a time
// (a partial unique index on picks(group_id) WHERE picker_id IS NULL enforces
// it), so create is idempotent: if a night is already open we resume it (200)
// rather than create a second — the request's scheduledFor/attendees are then
// ignored. Otherwise we validate every initial attendee is a member BEFORE any
// write (so bad input fails before we create anything), then insert the night
// and attendees without a transaction — like joinMemberHandler, a
// partially-populated planned night is inert (picker NULL → no standings impact)
// and a retried add is idempotent.
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
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		ctx := r.Context()
		// Resume the open night if one exists — at most one per group.
		if resumeOpenNight(w, r, store, gid) {
			return
		}
		for _, uid := range parsed.Attendees {
			if !requireMember(w, r, store, gid, uid) {
				return
			}
		}
		night, err := store.CreateNight(ctx, db.CreateNightParams{GroupID: gid, ScheduledFor: parsed.ScheduledFor})
		if err != nil {
			// A concurrent create won the race to open this group's night (the
			// partial unique index rejected ours). Resume the winner — same
			// idempotent outcome as the pre-check above, never a 500.
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				// The winner having already been finalized between our failed
				// insert and this read is genuinely unexpected — a 500, not a
				// silent no-response.
				if !resumeOpenNight(w, r, store, gid) {
					internalError(w, gid, "get open night", err)
				}
				return
			}
			internalError(w, gid, "create night", err)
			return
		}
		for _, uid := range parsed.Attendees {
			if err := store.AddAttendee(ctx, db.AddAttendeeParams{PickID: night.ID, UserID: uid}); err != nil {
				internalError(w, gid, "add attendee", err)
				return
			}
		}
		writeNightDTO(w, r, store, gid, night, http.StatusCreated)
	}
}

// addAttendeeHandler serves POST /groups/{groupId}/nights/{nightId}/attendees.
func addAttendeeHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := pathGroupNight(w, r)
		if !ok {
			return
		}
		req, ok := decodeJSON[attendeeRequest](w, r)
		if !ok {
			return
		}
		uid, ok := parseUUID(w, req.UserID, "invalid user id")
		if !ok {
			return
		}
		night, ok := loadNight(w, r, store, gid, nightID)
		if !ok {
			return
		}
		if !requireMember(w, r, store, gid, uid) {
			return
		}
		if err := store.AddAttendee(r.Context(), db.AddAttendeeParams{PickID: nightID, UserID: uid}); err != nil {
			internalError(w, gid, "add attendee", err)
			return
		}
		writeNightDTO(w, r, store, gid, night, http.StatusCreated)
	}
}

// removeAttendeeHandler serves DELETE /groups/{groupId}/nights/{nightId}/attendees/{userId}.
// Idempotent: removing a non-attendee still returns 200 with the current night.
func removeAttendeeHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := pathGroupNight(w, r)
		if !ok {
			return
		}
		uid, ok := pathUUID(w, r, "userId", "invalid user id")
		if !ok {
			return
		}
		night, ok := loadNight(w, r, store, gid, nightID)
		if !ok {
			return
		}
		if err := store.RemoveAttendee(r.Context(), db.RemoveAttendeeParams{PickID: nightID, UserID: uid}); err != nil {
			internalError(w, gid, "remove attendee", err)
			return
		}
		writeNightDTO(w, r, store, gid, night, http.StatusOK)
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

// currentNightHandler serves GET /groups/{groupId}/nights/current — the group's
// latest night, regardless of whether a pick has been recorded, so the app
// resumes and can correct it across sessions; 404 only when the group has no
// nights.
func currentNightHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}
		night, err := store.GetCurrentNight(r.Context(), gid)
		if err != nil {
			storeError(w, gid, "get current night", err, http.StatusNotFound, "no current night")
			return
		}
		writeNightDTO(w, r, store, gid, night, http.StatusOK)
	}
}

// nightTurnHandler serves GET /groups/{groupId}/nights/{nightId}/turn — the core
// pick order over the night's attendees. Reuses RankGroupTurn with the attendee
// IDs as a non-nil present set (empty present = rank nobody).
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
		ranked, err := store.RankGroupTurn(ctx, db.RankGroupTurnParams{GroupID: gid, Present: presentIDs(rows)})
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
			writeJSONError(w, http.StatusUnprocessableEntity, "picker is not an attendee of this night")
			return
		}
		night, err := store.SetNightPicker(r.Context(), db.SetNightPickerParams{
			NightID:    nightID,
			GroupID:    gid,
			PickerID:   pgtype.UUID{Bytes: pickerID, Valid: true},
			IsCredited: creditedForRole(role),
		})
		if err != nil {
			internalError(w, gid, "set night picker", err)
			return
		}
		writeNightDTO(w, r, store, gid, night, http.StatusOK)
	}
}

// updateNightDateHandler serves PATCH /groups/{groupId}/nights/{nightId}. Body
// {"scheduledFor":"YYYY-MM-DD"} moves the night to a new date.
func updateNightDateHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := pathGroupNight(w, r)
		if !ok {
			return
		}
		req, ok := decodeJSON[updateNightDateRequest](w, r)
		if !ok {
			return
		}
		scheduledFor, err := validateUpdateNightDateRequest(req)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		// Existence check only — UpdateNightDate hands back the moved night.
		if _, ok := loadNight(w, r, store, gid, nightID); !ok {
			return
		}
		night, err := store.UpdateNightDate(r.Context(), db.UpdateNightDateParams{
			NightID:      nightID,
			GroupID:      gid,
			ScheduledFor: scheduledFor,
		})
		if err != nil {
			internalError(w, gid, "update night date", err)
			return
		}
		writeNightDTO(w, r, store, gid, night, http.StatusOK)
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
