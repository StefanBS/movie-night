package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// joinRequest is the JSON body of POST /groups/{groupId}/members.
type joinRequest struct {
	Name string `json:"name"`
}

// validateJoinName trims and requires a non-empty member name. Pure.
func validateJoinName(req joinRequest) (string, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return "", fmt.Errorf("name is required")
	}
	return name, nil
}

// seedBaseline computes the baseline_picks to stamp on a membership entering the
// rotation so its TOTAL served-count (baseline + existing credited picks) lands
// at the current active-core average. Pure; never negative. For a brand-new
// joiner (existingCredited == 0) this is exactly round(avg).
func seedBaseline(avgServed float64, existingCredited int32) int32 {
	seed := int32(math.Round(avgServed)) - existingCredited
	if seed < 0 {
		return 0
	}
	return seed
}

// memberStore is the subset of *db.Queries the churn handlers need; the real
// *db.Queries satisfies it, so no mock is ever written (same pattern as
// pickStore/turnStore).
type memberStore interface {
	CreateUser(ctx context.Context, name string) (db.User, error)
	InsertMembership(ctx context.Context, arg db.InsertMembershipParams) (db.Membership, error)
	GetGroupMember(ctx context.Context, arg db.GetGroupMemberParams) (db.GetGroupMemberRow, error)
	DeactivateMembership(ctx context.Context, arg db.DeactivateMembershipParams) (db.Membership, error)
	ReactivateMembership(ctx context.Context, arg db.ReactivateMembershipParams) (db.Membership, error)
	PromoteMembership(ctx context.Context, arg db.PromoteMembershipParams) (db.Membership, error)
	AverageServedCount(ctx context.Context, groupID uuid.UUID) (float64, error)
	MemberCreditedCount(ctx context.Context, arg db.MemberCreditedCountParams) (int32, error)
	MaxRotationPosition(ctx context.Context, groupID uuid.UUID) (int32, error)
}

// internalError logs a failed store call and writes a 500. gid is a parsed
// uuid.UUID (canonical hex), not free-form input.
func internalError(w http.ResponseWriter, gid uuid.UUID, what string, err error) {
	log.Printf("%s (%s): %v", what, gid, err) //#nosec G706 -- gid is a parsed uuid.UUID
	writeJSONError(w, http.StatusInternalServerError, "internal server error")
}

// encodeMember writes a member DTO as JSON with the given status code.
func encodeMember(w http.ResponseWriter, gid, userID uuid.UUID, name, role, status string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(memberResponse{
		ID:     userID.String(),
		Name:   name,
		Role:   role,
		Status: status,
	}); err != nil {
		log.Printf("encode member response (%s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID
	}
}

// joinMemberHandler serves POST /groups/{groupId}/members: a new person joins
// the rotation as an active core member, seeded to the current average.
func joinMemberHandler(store memberStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, err := parseGroupID(r.PathValue("groupId"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid group id")
			return
		}
		var req joinRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		name, err := validateJoinName(req)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}

		// Read-then-write without a transaction is deliberate: rotation_position
		// is only an ORDER BY tiebreak (no uniqueness constraint) and the seed can
		// drift at most ±1 under simultaneous joins — acceptable for this app.
		ctx := r.Context()
		avg, err := store.AverageServedCount(ctx, gid)
		if err != nil {
			internalError(w, gid, "average served", err)
			return
		}
		maxPos, err := store.MaxRotationPosition(ctx, gid)
		if err != nil {
			internalError(w, gid, "max rotation position", err)
			return
		}
		user, err := store.CreateUser(ctx, name)
		if err != nil {
			internalError(w, gid, "create user", err)
			return
		}
		membership, err := store.InsertMembership(ctx, db.InsertMembershipParams{
			GroupID:          gid,
			UserID:           user.ID,
			Role:             db.MembershipRoleCore,
			Status:           db.MembershipStatusActive,
			BaselinePicks:    seedBaseline(avg, 0),
			RotationPosition: maxPos + 1,
		})
		if err != nil {
			internalError(w, gid, "insert membership", err)
			return
		}

		encodeMember(w, gid, user.ID, user.Name, string(membership.Role), string(membership.Status), http.StatusCreated)
	}
}

// parseGroupAndUser validates the {groupId} and {userId} path segments as UUIDs,
// writing a 400 and returning ok=false on either malformed value.
func parseGroupAndUser(w http.ResponseWriter, r *http.Request) (gid, uid uuid.UUID, ok bool) {
	gid, err := parseGroupID(r.PathValue("groupId"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid group id")
		return uuid.UUID{}, uuid.UUID{}, false
	}
	uid, err = uuid.Parse(r.PathValue("userId"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid user id")
		return uuid.UUID{}, uuid.UUID{}, false
	}
	return gid, uid, true
}

// loadMember fetches a member for a transition handler, mapping a missing
// membership to 404 and any other error to 500. ok=false means a response has
// already been written and the caller should stop.
func loadMember(w http.ResponseWriter, r *http.Request, store memberStore, gid, uid uuid.UUID) (db.GetGroupMemberRow, bool) {
	m, err := store.GetGroupMember(r.Context(), db.GetGroupMemberParams{GroupID: gid, UserID: uid})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "member not found")
			return db.GetGroupMemberRow{}, false
		}
		internalError(w, gid, "get group member", err)
		return db.GetGroupMemberRow{}, false
	}
	return m, true
}

// deactivateMemberHandler serves POST /groups/{groupId}/members/{userId}/deactivate.
func deactivateMemberHandler(store memberStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, uid, ok := parseGroupAndUser(w, r)
		if !ok {
			return
		}
		m, ok := loadMember(w, r, store, gid, uid)
		if !ok {
			return
		}
		// Idempotent: already inactive → no-op.
		if m.Status == db.MembershipStatusInactive {
			encodeMember(w, gid, m.UserID, m.Name, string(m.Role), string(m.Status), http.StatusOK)
			return
		}
		updated, err := store.DeactivateMembership(r.Context(), db.DeactivateMembershipParams{GroupID: gid, UserID: uid})
		if err != nil {
			internalError(w, gid, "deactivate membership", err)
			return
		}
		encodeMember(w, gid, updated.UserID, m.Name, string(updated.Role), string(updated.Status), http.StatusOK)
	}
}

// reactivateMemberHandler serves POST /groups/{groupId}/members/{userId}/reactivate.
func reactivateMemberHandler(store memberStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, uid, ok := parseGroupAndUser(w, r)
		if !ok {
			return
		}
		ctx := r.Context()
		m, ok := loadMember(w, r, store, gid, uid)
		if !ok {
			return
		}
		// Idempotent: already active → no-op.
		if m.Status == db.MembershipStatusActive {
			encodeMember(w, gid, m.UserID, m.Name, string(m.Role), string(m.Status), http.StatusOK)
			return
		}
		// Seed only when this crosses into the rotation (active core). A
		// reactivated guest stays out of the rotation, so its baseline is kept.
		baseline := m.BaselinePicks
		if m.Role == db.MembershipRoleCore {
			avg, err := store.AverageServedCount(ctx, gid)
			if err != nil {
				internalError(w, gid, "average served", err)
				return
			}
			credited, err := store.MemberCreditedCount(ctx, db.MemberCreditedCountParams{GroupID: gid, UserID: pgtype.UUID{Bytes: uid, Valid: true}})
			if err != nil {
				internalError(w, gid, "member credited count", err)
				return
			}
			baseline = seedBaseline(avg, credited)
		}
		updated, err := store.ReactivateMembership(ctx, db.ReactivateMembershipParams{GroupID: gid, UserID: uid, BaselinePicks: baseline})
		if err != nil {
			internalError(w, gid, "reactivate membership", err)
			return
		}
		encodeMember(w, gid, updated.UserID, m.Name, string(updated.Role), string(updated.Status), http.StatusOK)
	}
}

// promoteMemberHandler serves POST /groups/{groupId}/members/{userId}/promote.
func promoteMemberHandler(store memberStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, uid, ok := parseGroupAndUser(w, r)
		if !ok {
			return
		}
		ctx := r.Context()
		m, ok := loadMember(w, r, store, gid, uid)
		if !ok {
			return
		}
		// Idempotent: already active core → no-op.
		if m.Role == db.MembershipRoleCore && m.Status == db.MembershipStatusActive {
			encodeMember(w, gid, m.UserID, m.Name, string(m.Role), string(m.Status), http.StatusOK)
			return
		}
		avg, err := store.AverageServedCount(ctx, gid)
		if err != nil {
			internalError(w, gid, "average served", err)
			return
		}
		credited, err := store.MemberCreditedCount(ctx, db.MemberCreditedCountParams{GroupID: gid, UserID: pgtype.UUID{Bytes: uid, Valid: true}})
		if err != nil {
			internalError(w, gid, "member credited count", err)
			return
		}
		maxPos, err := store.MaxRotationPosition(ctx, gid)
		if err != nil {
			internalError(w, gid, "max rotation position", err)
			return
		}
		updated, err := store.PromoteMembership(ctx, db.PromoteMembershipParams{
			GroupID:          gid,
			UserID:           uid,
			BaselinePicks:    seedBaseline(avg, credited),
			RotationPosition: maxPos + 1,
		})
		if err != nil {
			internalError(w, gid, "promote membership", err)
			return
		}
		encodeMember(w, gid, updated.UserID, m.Name, string(updated.Role), string(updated.Status), http.StatusOK)
	}
}
