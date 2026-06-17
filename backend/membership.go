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

// memberDate renders a membership's joined_at as a YYYY-MM-DD string. joined_at
// is a timestamptz, so this is its UTC calendar date (the format matches the
// turn handler's lastPickedOn, though that field is already a pure ::date). An
// unset timestamp yields "", though joined_at is NOT NULL in practice.
func memberDate(ts pgtype.Timestamptz) string {
	if !ts.Valid {
		return ""
	}
	return ts.Time.Format("2006-01-02")
}

// encodeMember writes a member DTO as JSON with the given status code.
func encodeMember(w http.ResponseWriter, gid, userID uuid.UUID, name, role, status, joinedOn string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(memberResponse{
		ID:       userID.String(),
		Name:     name,
		Role:     role,
		Status:   status,
		JoinedOn: joinedOn,
	}); err != nil {
		log.Printf("encode member response (%s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID
	}
}

// joinMemberHandler serves POST /groups/{groupId}/members: a new person joins
// the rotation as an active core member, seeded to the current average.
func joinMemberHandler(store memberStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
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

		// Read-then-write without a transaction is deliberate. Two distinct
		// concerns, both acceptable for this single-group, admin-driven app:
		//
		//   Consistency: under simultaneous joins the avg/maxPos reads can go
		//   stale, but rotation_position is only an ORDER BY tiebreak (no
		//   uniqueness constraint) so a collision just falls back to name order,
		//   and the seed drifts at most ±1 — within fairness tolerance. A plain
		//   transaction would NOT fix this (READ COMMITTED still sees concurrent
		//   commits between the reads and the write); it needs SERIALIZABLE+retry
		//   or locking, which isn't warranted at this concurrency.
		//
		//   Atomicity: if InsertMembership fails after CreateUser, the user row
		//   is orphaned. It's inert — nothing reads users except through
		//   memberships — and a retried join just creates a fresh user. Wrapping
		//   in a tx would fix this cheaply but is the codebase's first transaction;
		//   defer it until a second multi-statement write justifies a WithTx helper.
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

		encodeMember(w, gid, user.ID, user.Name, string(membership.Role), string(membership.Status), memberDate(membership.JoinedAt), http.StatusCreated)
	}
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
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}
		uid, ok := pathUUID(w, r, "userId", "invalid user id")
		if !ok {
			return
		}
		m, ok := loadMember(w, r, store, gid, uid)
		if !ok {
			return
		}
		// Idempotent: already inactive → no-op.
		if m.Status == db.MembershipStatusInactive {
			encodeMember(w, gid, m.UserID, m.Name, string(m.Role), string(m.Status), memberDate(m.JoinedAt), http.StatusOK)
			return
		}
		updated, err := store.DeactivateMembership(r.Context(), db.DeactivateMembershipParams{GroupID: gid, UserID: uid})
		if err != nil {
			internalError(w, gid, "deactivate membership", err)
			return
		}
		encodeMember(w, gid, updated.UserID, m.Name, string(updated.Role), string(updated.Status), memberDate(updated.JoinedAt), http.StatusOK)
	}
}

// reactivateMemberHandler serves POST /groups/{groupId}/members/{userId}/reactivate.
func reactivateMemberHandler(store memberStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}
		uid, ok := pathUUID(w, r, "userId", "invalid user id")
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
			encodeMember(w, gid, m.UserID, m.Name, string(m.Role), string(m.Status), memberDate(m.JoinedAt), http.StatusOK)
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
		encodeMember(w, gid, updated.UserID, m.Name, string(updated.Role), string(updated.Status), memberDate(updated.JoinedAt), http.StatusOK)
	}
}

// promoteMemberHandler serves POST /groups/{groupId}/members/{userId}/promote.
func promoteMemberHandler(store memberStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}
		uid, ok := pathUUID(w, r, "userId", "invalid user id")
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
			encodeMember(w, gid, m.UserID, m.Name, string(m.Role), string(m.Status), memberDate(m.JoinedAt), http.StatusOK)
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
		encodeMember(w, gid, updated.UserID, m.Name, string(updated.Role), string(updated.Status), memberDate(updated.JoinedAt), http.StatusOK)
	}
}
