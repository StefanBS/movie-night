package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

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

// validateCreateNightRequest validates a decoded body: scheduledFor must be an
// ISO (YYYY-MM-DD) date and every attendee must be a UUID. Pure — no DB, no clock.
func validateCreateNightRequest(req createNightRequest) (parsedCreateNight, error) {
	t, err := time.Parse("2006-01-02", req.ScheduledFor)
	if err != nil {
		return parsedCreateNight{}, fmt.Errorf("invalid scheduledFor")
	}
	attendees, err := parseAttendeeIDs(req.Attendees)
	if err != nil {
		return parsedCreateNight{}, err
	}
	return parsedCreateNight{
		ScheduledFor: pgtype.Date{Time: t, Valid: true},
		Attendees:    attendees,
	}, nil
}

// attendee is one person recorded as present on a night.
type attendee struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

// movieDTO is the JSON shape for an attached movie (and a search result).
// ReleaseYear is null when TMDB has no release date.
type movieDTO struct {
	TMDBID      int    `json:"tmdbId"`
	Title       string `json:"title"`
	ReleaseYear *int   `json:"releaseYear"`
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

// releaseYearPtr renders a nullable release year as *int (nil → JSON null).
func releaseYearPtr(v pgtype.Int4) *int {
	if !v.Valid {
		return nil
	}
	y := int(v.Int32)
	return &y
}

// movieDTOPtr maps a cached movie row to the DTO; nil renders "movie" as null.
func movieDTOPtr(m *db.Movie) *movieDTO {
	if m == nil {
		return nil
	}
	return &movieDTO{TMDBID: int(m.TmdbID), Title: m.Title, ReleaseYear: releaseYearPtr(m.ReleaseYear)}
}

// toNightResponse maps a night row + attendee rows to the night DTO. Attendees
// is always non-nil so an empty list encodes as [] rather than null.
func toNightResponse(p db.Pick, rows []db.ListNightAttendeesRow, movie *db.Movie) nightResponse {
	attendees := make([]attendee, 0, len(rows))
	for _, r := range rows {
		attendees = append(attendees, attendee{
			ID:   r.ID.String(),
			Name: r.Name,
			Role: string(r.Role),
		})
	}
	return nightResponse{
		ID:           p.ID.String(),
		ScheduledFor: p.ScheduledFor.Time.Format("2006-01-02"),
		PickerID:     pickerIDPtr(p.PickerID),
		Movie:        movieDTOPtr(movie),
		Attendees:    attendees,
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
}

// attendeeRequest is the JSON body of POST .../nights/{nightId}/attendees.
type attendeeRequest struct {
	UserID string `json:"userId"`
}

// recordPickRequest is the JSON body of POST .../nights/{nightId}/pick.
type recordPickRequest struct {
	PickerID string `json:"pickerId"`
}

// movieRequest is the JSON body of POST .../nights/{nightId}/movie. Only the
// tmdbId is sent; the backend re-fetches canonical title/year from TMDB.
type movieRequest struct {
	TMDBID int `json:"tmdbId"`
}

// validateMovieRequest checks the attach body. Pure.
func validateMovieRequest(req movieRequest) error {
	if req.TMDBID <= 0 {
		return fmt.Errorf("invalid tmdbId")
	}
	return nil
}

// int4Ptr maps an optional release year to pgtype.Int4 for UpsertMovie.
func int4Ptr(v *int) pgtype.Int4 {
	if v == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(*v), Valid: true}
}

// toMovieResults maps TMDB search hits to the JSON DTO (always non-nil → []).
func toMovieResults(results []movieResult) []movieDTO {
	out := make([]movieDTO, 0, len(results))
	for _, m := range results {
		out = append(out, movieDTO{TMDBID: m.TMDBID, Title: m.Title, ReleaseYear: m.ReleaseYear})
	}
	return out
}

// creditedForRole derives is_credited from the picker's role: a core pick moves
// the rotation (credited); a guest pick never does. Pure.
func creditedForRole(role db.MembershipRole) bool {
	return role == db.MembershipRoleCore
}

// parseGroupAndNight validates the {groupId} and {nightId} path segments as
// UUIDs, writing a 400 and returning ok=false on either malformed value.
func parseGroupAndNight(w http.ResponseWriter, r *http.Request) (gid, nightID uuid.UUID, ok bool) {
	gid, err := parseGroupID(r.PathValue("groupId"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid group id")
		return uuid.UUID{}, uuid.UUID{}, false
	}
	nightID, err = uuid.Parse(r.PathValue("nightId"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid night id")
		return uuid.UUID{}, uuid.UUID{}, false
	}
	return gid, nightID, true
}

// ensureNight confirms a night exists in this group, mapping a miss to 404 and
// any other error to 500. ok=false means a response was already written.
func ensureNight(w http.ResponseWriter, r *http.Request, store nightStore, gid, nightID uuid.UUID) bool {
	if _, err := store.GetNight(r.Context(), db.GetNightParams{NightID: nightID, GroupID: gid}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "night not found")
			return false
		}
		internalError(w, gid, "get night", err)
		return false
	}
	return true
}

// writeNightDTO loads the night + its attendees and encodes the DTO with the
// given status. Used by create/add/remove/detail so the client always gets the
// current attendee list back.
func writeNightDTO(w http.ResponseWriter, r *http.Request, store nightStore, gid, nightID uuid.UUID, code int) {
	night, err := store.GetNight(r.Context(), db.GetNightParams{NightID: nightID, GroupID: gid})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "night not found")
			return
		}
		internalError(w, gid, "get night", err)
		return
	}
	var movie *db.Movie
	if night.MovieID.Valid {
		m, err := store.GetMovie(r.Context(), uuid.UUID(night.MovieID.Bytes))
		if err != nil {
			internalError(w, gid, "get movie", err)
			return
		}
		movie = &m
	}
	rows, err := store.ListNightAttendees(r.Context(), db.ListNightAttendeesParams{GroupID: gid, NightID: nightID})
	if err != nil {
		internalError(w, gid, "list night attendees", err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(toNightResponse(night, rows, movie)); err != nil {
		log.Printf("encode night response (%s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID (canonical hex), not free-form input
	}
}

// requireMember validates that uid has a membership in the group (active OR
// inactive), writing a 422 on a miss and 500 on any other error. Inactive
// members are intentionally allowed: attendance records presence, and the pick
// order filters to active core (RankGroupTurn), so an inactive attendee — like a
// guest — is recorded but never appears in the order. ok=false means a response
// was already written.
func requireMember(w http.ResponseWriter, r *http.Request, store nightStore, gid, uid uuid.UUID) bool {
	if _, err := store.GetGroupMember(r.Context(), db.GetGroupMemberParams{GroupID: gid, UserID: uid}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusUnprocessableEntity, "attendee is not a member of this group")
			return false
		}
		internalError(w, gid, "get group member", err)
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
		gid, err := parseGroupID(r.PathValue("groupId"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid group id")
			return
		}
		var req createNightRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		parsed, err := validateCreateNightRequest(req)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		ctx := r.Context()
		// Resume the open night if one exists — at most one per group.
		if existing, err := store.GetOpenNight(ctx, gid); err == nil {
			writeNightDTO(w, r, store, gid, existing.ID, http.StatusOK)
			return
		} else if !errors.Is(err, pgx.ErrNoRows) {
			internalError(w, gid, "get open night", err)
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
				existing, gerr := store.GetOpenNight(ctx, gid)
				if gerr != nil {
					internalError(w, gid, "get open night", gerr)
					return
				}
				writeNightDTO(w, r, store, gid, existing.ID, http.StatusOK)
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
		writeNightDTO(w, r, store, gid, night.ID, http.StatusCreated)
	}
}

// addAttendeeHandler serves POST /groups/{groupId}/nights/{nightId}/attendees.
func addAttendeeHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := parseGroupAndNight(w, r)
		if !ok {
			return
		}
		var req attendeeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		uid, err := uuid.Parse(req.UserID)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid user id")
			return
		}
		if !ensureNight(w, r, store, gid, nightID) {
			return
		}
		if !requireMember(w, r, store, gid, uid) {
			return
		}
		if err := store.AddAttendee(r.Context(), db.AddAttendeeParams{PickID: nightID, UserID: uid}); err != nil {
			internalError(w, gid, "add attendee", err)
			return
		}
		writeNightDTO(w, r, store, gid, nightID, http.StatusCreated)
	}
}

// removeAttendeeHandler serves DELETE /groups/{groupId}/nights/{nightId}/attendees/{userId}.
// Idempotent: removing a non-attendee still returns 200 with the current night.
func removeAttendeeHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := parseGroupAndNight(w, r)
		if !ok {
			return
		}
		uid, err := uuid.Parse(r.PathValue("userId"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid user id")
			return
		}
		if !ensureNight(w, r, store, gid, nightID) {
			return
		}
		if err := store.RemoveAttendee(r.Context(), db.RemoveAttendeeParams{PickID: nightID, UserID: uid}); err != nil {
			internalError(w, gid, "remove attendee", err)
			return
		}
		writeNightDTO(w, r, store, gid, nightID, http.StatusOK)
	}
}

// nightDetailHandler serves GET /groups/{groupId}/nights/{nightId}.
func nightDetailHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := parseGroupAndNight(w, r)
		if !ok {
			return
		}
		writeNightDTO(w, r, store, gid, nightID, http.StatusOK)
	}
}

// currentNightHandler serves GET /groups/{groupId}/nights/current — the group's
// latest night, regardless of whether a pick has been recorded, so the app
// resumes and can correct it across sessions; 404 only when the group has no
// nights.
func currentNightHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, err := parseGroupID(r.PathValue("groupId"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid group id")
			return
		}
		night, err := store.GetCurrentNight(r.Context(), gid)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeJSONError(w, http.StatusNotFound, "no current night")
				return
			}
			internalError(w, gid, "get current night", err)
			return
		}
		writeNightDTO(w, r, store, gid, night.ID, http.StatusOK)
	}
}

// nightTurnHandler serves GET /groups/{groupId}/nights/{nightId}/turn — the core
// pick order over the night's attendees. Reuses RankGroupTurn with the attendee
// IDs as a non-nil present set (empty present = rank nobody).
func nightTurnHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := parseGroupAndNight(w, r)
		if !ok {
			return
		}
		ctx := r.Context()
		if !ensureNight(w, r, store, gid, nightID) {
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
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(toTurnResponses(ranked)); err != nil {
			log.Printf("encode turn response (%s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID (canonical hex), not free-form input
		}
	}
}

// recordNightPickHandler serves POST /groups/{groupId}/nights/{nightId}/pick.
// It sets (or changes — the correction path) the night's picker. The picker MUST
// be an attendee; is_credited is derived from their role, so a guest pick never
// moves standings. RankGroupTurn recomputes served-counts from the picks table on
// read, so re-recording simply re-attributes — there is no stored counter to fix.
func recordNightPickHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := parseGroupAndNight(w, r)
		if !ok {
			return
		}
		var req recordPickRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		pickerID, err := uuid.Parse(req.PickerID)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid picker id")
			return
		}
		if !ensureNight(w, r, store, gid, nightID) {
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
		if _, err := store.SetNightPicker(r.Context(), db.SetNightPickerParams{
			NightID:    nightID,
			GroupID:    gid,
			PickerID:   pgtype.UUID{Bytes: pickerID, Valid: true},
			IsCredited: creditedForRole(role),
		}); err != nil {
			internalError(w, gid, "set night picker", err)
			return
		}
		writeNightDTO(w, r, store, gid, nightID, http.StatusOK)
	}
}

// searchMoviesHandler serves GET /movies/search?q=… — a thin TMDB proxy so the
// API token stays server-side. 400 empty query, 503 when TMDB is unconfigured,
// 502 on an upstream failure.
func searchMoviesHandler(client *tmdbClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" {
			writeJSONError(w, http.StatusBadRequest, "missing query")
			return
		}
		if client == nil {
			writeJSONError(w, http.StatusServiceUnavailable, "movie search is not configured")
			return
		}
		results, err := client.SearchMovies(r.Context(), q)
		if err != nil {
			log.Printf("tmdb search %q: %v", q, err) //#nosec G706 -- q is a user query string logged with %q, not used as a format string
			writeJSONError(w, http.StatusBadGateway, "movie search failed")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(toMovieResults(results)); err != nil {
			log.Printf("encode movie results: %v", err) //#nosec G706 -- only an error value, no user input
		}
	}
}

// recordNightMovieHandler serves POST /groups/{groupId}/nights/{nightId}/movie.
// The body carries only {tmdbId}; the backend re-fetches canonical title/year from
// TMDB (source of truth), caches the movie, and sets it on the night. Repeatable:
// attaching a different movie is the correction path.
func recordNightMovieHandler(store nightStore, client *tmdbClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := parseGroupAndNight(w, r)
		if !ok {
			return
		}
		var req movieRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if err := validateMovieRequest(req); err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		if !ensureNight(w, r, store, gid, nightID) {
			return
		}
		if client == nil {
			writeJSONError(w, http.StatusServiceUnavailable, "movie attach is not configured")
			return
		}
		movie, err := client.FetchMovie(r.Context(), req.TMDBID)
		if err != nil {
			if errors.Is(err, errMovieNotFound) {
				writeJSONError(w, http.StatusNotFound, "no such movie")
				return
			}
			log.Printf("tmdb fetch movie %d: %v", req.TMDBID, err) //#nosec G706 -- req.TMDBID is an int
			writeJSONError(w, http.StatusBadGateway, "movie lookup failed")
			return
		}
		cached, err := store.UpsertMovie(r.Context(), db.UpsertMovieParams{
			TmdbID:      int32(movie.TMDBID),
			Title:       movie.Title,
			ReleaseYear: int4Ptr(movie.ReleaseYear),
		})
		if err != nil {
			internalError(w, gid, "upsert movie", err)
			return
		}
		if _, err := store.SetNightMovie(r.Context(), db.SetNightMovieParams{
			MovieID: pgtype.UUID{Bytes: cached.ID, Valid: true},
			NightID: nightID,
			GroupID: gid,
		}); err != nil {
			internalError(w, gid, "set night movie", err)
			return
		}
		writeNightDTO(w, r, store, gid, nightID, http.StatusOK)
	}
}
