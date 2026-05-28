package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// memberDTO is the JSON shape returned by GET /groups/{groupId}/members.
type memberDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

// parseGroupID validates a path segment as a UUID.
func parseGroupID(s string) (uuid.UUID, error) {
	return uuid.Parse(s)
}

// toMemberDTOs maps sqlc rows to JSON DTOs, preserving order. It always
// returns a non-nil slice so an empty result encodes as [] rather than null.
func toMemberDTOs(rows []db.ListGroupMembersRow) []memberDTO {
	out := make([]memberDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, memberDTO{
			ID:   r.ID.String(),
			Name: r.Name,
			Role: string(r.Role),
		})
	}
	return out
}

// rosterStore is the slice of *db.Queries the handler needs. Declaring it as an
// interface keeps the handler wireable; the integration test passes the real
// *db.Queries, so no mock implementation is ever written.
type rosterStore interface {
	ListGroupMembers(ctx context.Context, groupID uuid.UUID) ([]db.ListGroupMembersRow, error)
}

// writeJSONError writes a JSON error body with a matching Content-Type, so every
// response this service emits — success and error alike — is application/json.
func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// membersHandler serves GET /groups/{groupId}/members.
func membersHandler(store rosterStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, err := parseGroupID(r.PathValue("groupId"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid group id")
			return
		}

		rows, err := store.ListGroupMembers(r.Context(), gid)
		if err != nil {
			log.Printf("list group members (%s): %v", gid, err)
			writeJSONError(w, http.StatusInternalServerError, "internal server error")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(toMemberDTOs(rows)); err != nil {
			log.Printf("encode members response (%s): %v", gid, err)
		}
	}
}
