package main

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// The writes that change who is in a group and in what state live here, and
// each runs inside the caller's withTx. A change to an existing membership
// locks it first (LockGroupMember), so planMove's rules are checked against a
// state no other write can change before this one commits. A member entering
// the rotation is seeded to the active-core average (ADR-0006).

// joinMember creates a user and gives them an active membership with role. A
// core member enters the rotation seeded to the current average in the next
// slot; a guest stays out of it with inert zero values.
//
// Two simultaneous core joins can both read the same average and slot. That is
// acceptable here: rotation_position is only an ORDER BY tiebreak (no
// uniqueness constraint), so a collision falls back to name order, and the
// seed drifts at most ±1, within fairness tolerance. READ COMMITTED doesn't
// prevent it; that would take SERIALIZABLE with retries or a group lock, which
// this single-group, admin-driven app doesn't warrant.
func joinMember(ctx context.Context, q *db.Queries, gid uuid.UUID, name string, role db.MembershipRole) (memberResponse, error) {
	var baseline, position int32
	if inRotation(role, db.MembershipStatusActive) {
		// The user doesn't exist yet, so seed against uuid.Nil: no picks are
		// credited to it, which is exactly a brand-new joiner's history.
		var err error
		if baseline, position, err = rotationSeed(ctx, q, gid, uuid.Nil); err != nil {
			return memberResponse{}, err
		}
	}
	user, err := q.CreateUser(ctx, name)
	if err != nil {
		return memberResponse{}, err
	}
	joinedAt, err := q.InsertMembership(ctx, db.InsertMembershipParams{
		GroupID:          gid,
		UserID:           user.ID,
		Role:             role,
		Status:           db.MembershipStatusActive,
		BaselinePicks:    baseline,
		RotationPosition: position,
	})
	if err != nil {
		return memberResponse{}, err
	}
	return newMemberResponse(user.ID, user.Name, role, db.MembershipStatusActive, joinedAt), nil
}

// moveMember applies a churn action to a member and returns them as they now
// are. A no-op move returns them unchanged; a move planMove refuses returns its
// error; a missing membership returns pgx.ErrNoRows. A move into the rotation
// re-seeds the baseline; promote also takes the next slot, while reactivate
// keeps the member's own (planMove decides which). A reactivated guest stays out of the rotation, so its
// baseline is kept.
func moveMember(ctx context.Context, q *db.Queries, gid, uid uuid.UUID, action memberAction) (memberResponse, error) {
	m, err := q.LockGroupMember(ctx, db.LockGroupMemberParams{GroupID: gid, UserID: uid})
	if err != nil {
		return memberResponse{}, err
	}
	move, err := planMove(action, m.Role, m.Status)
	if err != nil {
		return memberResponse{}, err
	}
	if move.noOp {
		return newMemberResponse(m.UserID, m.Name, m.Role, m.Status, m.JoinedAt), nil
	}
	baseline, position := m.BaselinePicks, m.RotationPosition
	if move.seed {
		var slot int32
		if baseline, slot, err = rotationSeed(ctx, q, gid, uid); err != nil {
			return memberResponse{}, err
		}
		if move.newSlot {
			position = slot
		}
	}
	if err := q.UpdateMembership(ctx, db.UpdateMembershipParams{
		GroupID:          gid,
		UserID:           uid,
		Role:             move.role,
		Status:           move.status,
		BaselinePicks:    baseline,
		RotationPosition: position,
	}); err != nil {
		return memberResponse{}, err
	}
	return newMemberResponse(uid, m.Name, move.role, move.status, m.JoinedAt), nil
}

// rotationSeed computes where a member entering the rotation lands: the
// baseline_picks that puts them on the current active-core average (discounting
// the credited picks they already have) and the next rotation slot. One query
// reads every input at a single point in time.
func rotationSeed(ctx context.Context, q *db.Queries, gid, uid uuid.UUID) (baseline, position int32, err error) {
	in, err := q.RotationSeedInputs(ctx, db.RotationSeedInputsParams{GroupID: gid, UserID: uid})
	if err != nil {
		return 0, 0, err
	}
	return seedBaseline(in.AvgServed, in.CreditedCount), in.MaxPosition + 1, nil
}

// writeMemberError maps a failed membership write to its response: a missing
// membership is a 404, a move the member's state doesn't allow a 409, and
// anything else a 500.
func writeMemberError(w http.ResponseWriter, gid uuid.UUID, op string, err error) {
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		writeJSONError(w, http.StatusNotFound, "member not found")
	case errors.Is(err, errPromoteInactive):
		writeJSONError(w, http.StatusConflict, err.Error())
	default:
		internalError(w, gid, op, err)
	}
}
