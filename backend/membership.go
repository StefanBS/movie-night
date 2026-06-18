package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// joinRequest is the JSON body of POST /groups/{groupId}/members. Role is
// optional and defaults to "core" (the historical behavior).
type joinRequest struct {
	Name string `json:"name"`
	Role string `json:"role"`
}

// validateJoin trims and requires a non-empty name, and resolves the role:
// empty defaults to "core", otherwise it must be "core" or "guest". Pure.
func validateJoin(req joinRequest) (name, role string, err error) {
	name = strings.TrimSpace(req.Name)
	if name == "" {
		return "", "", fmt.Errorf("name is required")
	}
	role = req.Role
	if role == "" {
		role = string(db.MembershipRoleCore)
	}
	if role != string(db.MembershipRoleCore) && role != string(db.MembershipRoleGuest) {
		return "", "", fmt.Errorf("role must be \"core\" or \"guest\"")
	}
	return name, role, nil
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

// encodeMember writes a member DTO as JSON with the given status code. Callers
// pass a built memberResponse (see currentMember/updatedMember) so the fields
// are named at the call site rather than positional.
func encodeMember(w http.ResponseWriter, gid uuid.UUID, resp memberResponse, code int) {
	respondJSON(w, code, resp, gid, "encode member response")
}

// currentMember renders an unchanged membership row as the response DTO — used
// by the idempotent no-op branches that echo the current state back.
func currentMember(m db.GetGroupMemberRow) memberResponse {
	return memberResponse{
		ID:       m.UserID.String(),
		Name:     m.Name,
		Role:     string(m.Role),
		Status:   string(m.Status),
		JoinedOn: memberDate(m.JoinedAt),
	}
}

// updatedMember renders a membership after a transition. The name comes from the
// pre-read row m because the transition queries (Deactivate/Reactivate/Promote)
// return the memberships row, which carries no user name.
func updatedMember(updated db.Membership, m db.GetGroupMemberRow) memberResponse {
	return memberResponse{
		ID:       updated.UserID.String(),
		Name:     m.Name,
		Role:     string(updated.Role),
		Status:   string(updated.Status),
		JoinedOn: memberDate(updated.JoinedAt),
	}
}

// joinMemberHandler serves POST /groups/{groupId}/members: a new person joins
// as an active member. A core member (the default) enters the rotation seeded
// to the current average; a guest stays out of the rotation.
func joinMemberHandler(store memberStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}
		req, ok := decodeJSON[joinRequest](w, r)
		if !ok {
			return
		}
		name, role, err := validateJoin(req)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}

		ctx := r.Context()

		// Guests never enter the rotation: skip the seed/position reads and
		// stamp inert zero values. Core members seed to the active-core average
		// and take the next rotation slot (the original behavior).
		baseline := int32(0)
		position := int32(0)
		if role == string(db.MembershipRoleCore) {
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
			baseline = seedBaseline(avg, 0)
			position = maxPos + 1
		}

		user, err := store.CreateUser(ctx, name)
		if err != nil {
			internalError(w, gid, "create user", err)
			return
		}
		membership, err := store.InsertMembership(ctx, db.InsertMembershipParams{
			GroupID:          gid,
			UserID:           user.ID,
			Role:             db.MembershipRole(role),
			Status:           db.MembershipStatusActive,
			BaselinePicks:    baseline,
			RotationPosition: position,
		})
		if err != nil {
			internalError(w, gid, "insert membership", err)
			return
		}

		encodeMember(w, gid, memberResponse{
			ID:       user.ID.String(),
			Name:     user.Name,
			Role:     string(membership.Role),
			Status:   string(membership.Status),
			JoinedOn: memberDate(membership.JoinedAt),
		}, http.StatusCreated)
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
			encodeMember(w, gid, currentMember(m), http.StatusOK)
			return
		}
		updated, err := store.DeactivateMembership(r.Context(), db.DeactivateMembershipParams{GroupID: gid, UserID: uid})
		if err != nil {
			internalError(w, gid, "deactivate membership", err)
			return
		}
		encodeMember(w, gid, updatedMember(updated, m), http.StatusOK)
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
			encodeMember(w, gid, currentMember(m), http.StatusOK)
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
		encodeMember(w, gid, updatedMember(updated, m), http.StatusOK)
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
			encodeMember(w, gid, currentMember(m), http.StatusOK)
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
		encodeMember(w, gid, updatedMember(updated, m), http.StatusOK)
	}
}
