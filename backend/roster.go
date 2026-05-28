package main

import (
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
