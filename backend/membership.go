package main

import (
	"errors"
	"fmt"
	"math"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// joinRequest is the JSON body of POST /groups/{groupId}/members. Both fields
// are required.
type joinRequest struct {
	Name string `json:"name"`
	Role string `json:"role"`
}

// validateJoin trims and requires a non-empty name (via validateGroupName, the
// shared name rule), and requires the role to be "core" or "guest". Pure.
func validateJoin(req joinRequest) (name string, role db.MembershipRole, err error) {
	name, err = validateGroupName(req.Name)
	if err != nil {
		return "", "", err
	}
	role = db.MembershipRole(req.Role)
	if role != db.MembershipRoleCore && role != db.MembershipRoleGuest {
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

// errPromoteInactive is planMove's one refused move, a 409.
var errPromoteInactive = errors.New("an inactive member must be reactivated before being promoted")

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
			return membershipMove{}, errPromoteInactive
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

// currentMember renders an unchanged membership row as the response DTO — used
// by the idempotent no-op branches that echo the current state back.
func currentMember(m db.LockGroupMemberRow) memberResponse {
	return memberResponse{
		ID:       m.UserID.String(),
		Name:     m.Name,
		Role:     string(m.Role),
		Status:   string(m.Status),
		JoinedOn: formatTimestampDate(m.JoinedAt),
	}
}

// updatedMember renders a membership after a transition. The name comes from the
// locked row m because the transition queries (Deactivate/Reactivate/Promote)
// return the memberships row, which carries no user name.
func updatedMember(updated db.Membership, m db.LockGroupMemberRow) memberResponse {
	return memberResponse{
		ID:       updated.UserID.String(),
		Name:     m.Name,
		Role:     string(updated.Role),
		Status:   string(updated.Status),
		JoinedOn: formatTimestampDate(updated.JoinedAt),
	}
}

// joinMemberHandler serves POST /groups/{groupId}/members: a new person joins
// as an active member with the role the body names (joinMember).
func joinMemberHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
		var member memberResponse
		err = withTx(r.Context(), pool, func(q *db.Queries) error {
			var err error
			member, err = joinMember(r.Context(), q, gid, name, role)
			return err
		})
		if err != nil {
			writeMemberError(w, gid, "join member", err)
			return
		}
		respondJSON(w, http.StatusCreated, member, gid, "encode member response")
	}
}

// moveMemberHandler serves POST /groups/{groupId}/members/{userId}/{action}
// for one action (deactivate, reactivate or promote), applied by moveMember.
func moveMemberHandler(pool *pgxpool.Pool, action memberAction) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, uid, ok := pathGroupUser(w, r)
		if !ok {
			return
		}
		var member memberResponse
		err := withTx(r.Context(), pool, func(q *db.Queries) error {
			var err error
			member, err = moveMember(r.Context(), q, gid, uid, action)
			return err
		})
		if err != nil {
			writeMemberError(w, gid, string(action)+" member", err)
			return
		}
		respondJSON(w, http.StatusOK, member, gid, "encode member response")
	}
}
