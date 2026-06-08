package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strings"

	"github.com/google/uuid"

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
