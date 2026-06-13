package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// memberResponse is the JSON shape returned by GET /groups/{groupId}/members and
// by the membership-churn write endpoints.
type memberResponse struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Role   string `json:"role"`
	Status string `json:"status"`
}

// toMemberResponses maps sqlc rows to JSON responses, preserving order. It always
// returns a non-nil slice so an empty result encodes as [] rather than null.
func toMemberResponses(rows []db.ListGroupMembersRow) []memberResponse {
	out := make([]memberResponse, 0, len(rows))
	for _, r := range rows {
		out = append(out, memberResponse{
			ID:     r.ID.String(),
			Name:   r.Name,
			Role:   string(r.Role),
			Status: string(r.Status),
		})
	}
	return out
}

// rosterStore is the subset of *db.Queries the handler needs. Declaring it as an
// interface keeps the handler wireable; the integration test passes the real
// *db.Queries, so no mock implementation is ever written.
type rosterStore interface {
	ListGroupMembers(ctx context.Context, groupID uuid.UUID) ([]db.ListGroupMembersRow, error)
}

// membersHandler serves GET /groups/{groupId}/members.
func membersHandler(store rosterStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}

		rows, err := store.ListGroupMembers(r.Context(), gid)
		if err != nil {
			log.Printf("list group members (%s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID (canonical hex), not free-form input
			writeJSONError(w, http.StatusInternalServerError, "internal server error")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(toMemberResponses(rows)); err != nil {
			log.Printf("encode members response (%s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID (canonical hex), not free-form input
		}
	}
}
