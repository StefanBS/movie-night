package main

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// memberResponse is the JSON shape returned by GET /groups/{groupId}/members and
// by the membership-churn write endpoints.
type memberResponse struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	Status   string `json:"status"`
	JoinedOn string `json:"joinedOn"`
}

// newMemberResponse is the one memberResponse builder, whatever row the
// member was read or written as.
func newMemberResponse(id uuid.UUID, name string, role db.MembershipRole, status db.MembershipStatus, joinedAt pgtype.Timestamptz) memberResponse {
	return memberResponse{
		ID:       id.String(),
		Name:     name,
		Role:     string(role),
		Status:   string(status),
		JoinedOn: formatDay(joinedAt.Time),
	}
}

// toMemberResponses maps sqlc rows to JSON responses, preserving order. It always
// returns a non-nil slice so an empty result encodes as [] rather than null.
func toMemberResponses(rows []db.ListGroupMembersRow) []memberResponse {
	out := make([]memberResponse, 0, len(rows))
	for _, r := range rows {
		out = append(out, newMemberResponse(r.ID, r.Name, r.Role, r.Status, r.JoinedAt))
	}
	return out
}

// membersHandler serves GET /groups/{groupId}/members.
func membersHandler(store *db.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}

		rows, err := store.ListGroupMembers(r.Context(), gid)
		if err != nil {
			internalError(w, gid, "list group members", err)
			return
		}

		respondJSON(w, http.StatusOK, toMemberResponses(rows))
	}
}
