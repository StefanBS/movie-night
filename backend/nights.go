package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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

// nightResponse is the JSON shape for a night and its current attendees.
type nightResponse struct {
	ID           string     `json:"id"`
	ScheduledFor string     `json:"scheduledFor"`
	Attendees    []attendee `json:"attendees"`
}

// toNightResponse maps a night row + attendee rows to the night DTO. Attendees
// is always non-nil so an empty list encodes as [] rather than null.
func toNightResponse(p db.Pick, rows []db.ListNightAttendeesRow) nightResponse {
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
	AddAttendee(ctx context.Context, arg db.AddAttendeeParams) error
	RemoveAttendee(ctx context.Context, arg db.RemoveAttendeeParams) error
	ListNightAttendees(ctx context.Context, arg db.ListNightAttendeesParams) ([]db.ListNightAttendeesRow, error)
	GetGroupMember(ctx context.Context, arg db.GetGroupMemberParams) (db.GetGroupMemberRow, error)
	RankGroupTurn(ctx context.Context, arg db.RankGroupTurnParams) ([]db.RankGroupTurnRow, error)
}

// attendeeRequest is the JSON body of POST .../nights/{nightId}/attendees.
type attendeeRequest struct {
	UserID string `json:"userId"`
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
	rows, err := store.ListNightAttendees(r.Context(), db.ListNightAttendeesParams{GroupID: gid, NightID: nightID})
	if err != nil {
		internalError(w, gid, "list night attendees", err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(toNightResponse(night, rows)); err != nil {
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

// createNightHandler serves POST /groups/{groupId}/nights. A night is a picks
// row with picker_id NULL. We validate every initial attendee is a member
// BEFORE any write (so bad input fails before we create anything), then insert
// the night and attendees without a transaction — like joinMemberHandler, a
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
		for _, uid := range parsed.Attendees {
			if !requireMember(w, r, store, gid, uid) {
				return
			}
		}
		night, err := store.CreateNight(ctx, db.CreateNightParams{GroupID: gid, ScheduledFor: parsed.ScheduledFor})
		if err != nil {
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
