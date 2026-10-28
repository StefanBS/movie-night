package main

import (
	"context"
	"fmt"
	"math"
	"net/http"

	"github.com/google/uuid"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// joinRequest is the JSON body of POST /groups/{groupId}/members. Role is
// optional and defaults to "core" (the historical behavior).
type joinRequest struct {
	Name string `json:"name"`
	Role string `json:"role"`
}

// validateJoin trims and requires a non-empty name (via validateGroupName, the
// shared name rule), and resolves the role: empty defaults to "core", otherwise
// it must be "core" or "guest". Pure.
func validateJoin(req joinRequest) (name, role string, err error) {
	name, err = validateGroupName(req.Name)
	if err != nil {
		return "", "", err
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

// memberAction is a churn transition on an existing membership; the value is
// the endpoint verb.
type memberAction string

const (
	actionDeactivate memberAction = "deactivate"
	actionReactivate memberAction = "reactivate"
	actionPromote    memberAction = "promote"
)

// membershipMove is what a churn action does to a member in a given state:
// noOp echoes the current state back unchanged (the actions are idempotent);
// seed means the move crosses into the rotation and must be re-seeded
// (ADR-0006).
type membershipMove struct {
	noOp bool
	seed bool
}

// inRotation reports whether a membership in this state takes turns: only
// active core members do (ADR-0004/0006).
func inRotation(role db.MembershipRole, status db.MembershipStatus) bool {
	return role == db.MembershipRoleCore && status == db.MembershipStatusActive
}

// planMove is the single owner of the membership transition rules: which moves
// are allowed, which are no-ops, and which re-seed. Promote requires an active
// guest — an inactive member must be reactivated first, so a returner keeps
// their slot instead of promote quietly reactivating them into a new one.
// The mobile memberActions mirrors these rules. A non-nil error means the move
// is not allowed from this state. Pure.
func planMove(action memberAction, role db.MembershipRole, status db.MembershipStatus) (membershipMove, error) {
	toRole, toStatus := role, status
	switch action {
	case actionDeactivate:
		toStatus = db.MembershipStatusInactive
	case actionReactivate:
		toStatus = db.MembershipStatusActive
	case actionPromote:
		if status != db.MembershipStatusActive {
			return membershipMove{}, fmt.Errorf("an inactive member must be reactivated before being promoted")
		}
		toRole = db.MembershipRoleCore
	default:
		return membershipMove{}, fmt.Errorf("unknown member action %q", action)
	}
	if toRole == role && toStatus == status {
		return membershipMove{noOp: true}, nil
	}
	return membershipMove{seed: !inRotation(role, status) && inRotation(toRole, toStatus)}, nil
}

// memberStore is the subset of *db.Queries the churn handlers need; the real
// *db.Queries satisfies it, so no mock is ever written (same pattern as
// pickStore/turnStore).
type memberStore interface {
	CreateUser(ctx context.Context, name string) (db.CreateUserRow, error)
	InsertMembership(ctx context.Context, arg db.InsertMembershipParams) (db.Membership, error)
	GetGroupMember(ctx context.Context, arg db.GetGroupMemberParams) (db.GetGroupMemberRow, error)
	DeactivateMembership(ctx context.Context, arg db.DeactivateMembershipParams) (db.Membership, error)
	ReactivateMembership(ctx context.Context, arg db.ReactivateMembershipParams) (db.Membership, error)
	PromoteMembership(ctx context.Context, arg db.PromoteMembershipParams) (db.Membership, error)
	RotationSeedInputs(ctx context.Context, arg db.RotationSeedInputsParams) (db.RotationSeedInputsRow, error)
}

// currentMember renders an unchanged membership row as the response DTO — used
// by the idempotent no-op branches that echo the current state back.
func currentMember(m db.GetGroupMemberRow) memberResponse {
	return memberResponse{
		ID:       m.UserID.String(),
		Name:     m.Name,
		Role:     string(m.Role),
		Status:   string(m.Status),
		JoinedOn: formatTimestampDate(m.JoinedAt),
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
		JoinedOn: formatTimestampDate(updated.JoinedAt),
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
		if inRotation(db.MembershipRole(role), db.MembershipStatusActive) {
			// Read-then-write without a transaction is deliberate. Two distinct
			// concerns, both acceptable for this single-group, admin-driven app:
			//
			//   Consistency: under simultaneous joins the seed read can go
			//   stale, but rotation_position is only an ORDER BY tiebreak (no
			//   uniqueness constraint) so a collision just falls back to name order,
			//   and the seed drifts at most ±1 — within fairness tolerance. A plain
			//   transaction would NOT fix this (READ COMMITTED still sees concurrent
			//   commits between the reads and the write); it needs SERIALIZABLE+retry
			//   or locking, which isn't warranted at this concurrency.
			//
			//   Atomicity: if InsertMembership fails after CreateUser, the user row
			//   is orphaned. It's inert — nothing reads users except through
			//   memberships — and a retried join just creates a fresh user. withTx
			//   (tx.go, introduced for the Night edit) would fix this cheaply; not
			//   yet adopted here.
			//
			// The user doesn't exist yet, so seed against uuid.Nil: no picks are
			// credited to it, which is exactly a brand-new joiner's history.
			if baseline, position, ok = rotationSeed(w, r, store, gid, uuid.Nil); !ok {
				return
			}
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

		respondJSON(w, http.StatusCreated, memberResponse{
			ID:       user.ID.String(),
			Name:     user.Name,
			Role:     string(membership.Role),
			Status:   string(membership.Status),
			JoinedOn: formatTimestampDate(membership.JoinedAt),
		}, gid, "encode member response")
	}
}

// loadMember fetches a member for a transition handler, mapping a missing
// membership to 404 and any other error to 500. ok=false means a response has
// already been written and the caller should stop.
func loadMember(w http.ResponseWriter, r *http.Request, store memberStore, gid, uid uuid.UUID) (db.GetGroupMemberRow, bool) {
	m, err := store.GetGroupMember(r.Context(), db.GetGroupMemberParams{GroupID: gid, UserID: uid})
	if err != nil {
		storeError(w, gid, "get group member", err, http.StatusNotFound, "member not found")
		return db.GetGroupMemberRow{}, false
	}
	return m, true
}

// gateMove applies planMove to a loaded member and writes the responses that end
// the request early: the unchanged member for a no-op, a 409 for a move the
// member's state doesn't allow. ok=false means a response has already been
// written and the caller should stop.
func gateMove(w http.ResponseWriter, action memberAction, m db.GetGroupMemberRow, gid uuid.UUID) (membershipMove, bool) {
	move, err := planMove(action, m.Role, m.Status)
	if err != nil {
		writeJSONError(w, http.StatusConflict, err.Error())
		return membershipMove{}, false
	}
	if move.noOp {
		respondJSON(w, http.StatusOK, currentMember(m), gid, "encode member response")
		return membershipMove{}, false
	}
	return move, true
}

// rotationSeed computes where a member entering the rotation lands: the
// baseline_picks that puts them on the current active-core average (discounting
// the credited picks they already have) and the next rotation slot. Join,
// reactivate and promote are all "crosses into the rotation" transitions, so the
// fairness rule lives here rather than being spelled out at each; reactivate
// keeps its slot and ignores the position. One query reads every input at a
// single point in time. ok=false means a response was already written.
func rotationSeed(w http.ResponseWriter, r *http.Request, store memberStore, gid, uid uuid.UUID) (baseline, position int32, ok bool) {
	in, err := store.RotationSeedInputs(r.Context(), db.RotationSeedInputsParams{GroupID: gid, UserID: uid})
	if err != nil {
		internalError(w, gid, "rotation seed inputs", err)
		return 0, 0, false
	}
	return seedBaseline(in.AvgServed, in.CreditedCount), in.MaxPosition + 1, true
}

// deactivateMemberHandler serves POST /groups/{groupId}/members/{userId}/deactivate.
func deactivateMemberHandler(store memberStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, uid, ok := pathGroupUser(w, r)
		if !ok {
			return
		}
		m, ok := loadMember(w, r, store, gid, uid)
		if !ok {
			return
		}
		if _, ok := gateMove(w, actionDeactivate, m, gid); !ok {
			return
		}
		updated, err := store.DeactivateMembership(r.Context(), db.DeactivateMembershipParams{GroupID: gid, UserID: uid})
		if err != nil {
			internalError(w, gid, "deactivate membership", err)
			return
		}
		respondJSON(w, http.StatusOK, updatedMember(updated, m), gid, "encode member response")
	}
}

// reactivateMemberHandler serves POST /groups/{groupId}/members/{userId}/reactivate.
func reactivateMemberHandler(store memberStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, uid, ok := pathGroupUser(w, r)
		if !ok {
			return
		}
		m, ok := loadMember(w, r, store, gid, uid)
		if !ok {
			return
		}
		move, ok := gateMove(w, actionReactivate, m, gid)
		if !ok {
			return
		}
		// A reactivated guest stays out of the rotation, so its baseline is kept.
		baseline := m.BaselinePicks
		if move.seed {
			if baseline, _, ok = rotationSeed(w, r, store, gid, uid); !ok {
				return
			}
		}
		updated, err := store.ReactivateMembership(r.Context(), db.ReactivateMembershipParams{GroupID: gid, UserID: uid, BaselinePicks: baseline})
		if err != nil {
			internalError(w, gid, "reactivate membership", err)
			return
		}
		respondJSON(w, http.StatusOK, updatedMember(updated, m), gid, "encode member response")
	}
}

// promoteMemberHandler serves POST /groups/{groupId}/members/{userId}/promote.
func promoteMemberHandler(store memberStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, uid, ok := pathGroupUser(w, r)
		if !ok {
			return
		}
		ctx := r.Context()
		m, ok := loadMember(w, r, store, gid, uid)
		if !ok {
			return
		}
		// planMove allows promote only from active guest, a move that always
		// crosses into the rotation (TestPlanMove pins seed=true), so it needs
		// a fresh baseline and a new rotation slot unconditionally.
		if _, ok := gateMove(w, actionPromote, m, gid); !ok {
			return
		}
		baseline, position, ok := rotationSeed(w, r, store, gid, uid)
		if !ok {
			return
		}
		updated, err := store.PromoteMembership(ctx, db.PromoteMembershipParams{
			GroupID:          gid,
			UserID:           uid,
			BaselinePicks:    baseline,
			RotationPosition: position,
		})
		if err != nil {
			// No row: deactivated since loadMember read them — the same 409.
			storeError(w, gid, "promote membership", err, http.StatusConflict, "an inactive member must be reactivated before being promoted")
			return
		}
		respondJSON(w, http.StatusOK, updatedMember(updated, m), gid, "encode member response")
	}
}
