package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// turnResponse is the JSON shape returned by GET /groups/{groupId}/turn.
// Element 0 of the returned array is tonight's picker. LastPickedOn is a
// pointer so a member who has never had a credited pick encodes as null.
type turnResponse struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Role         string  `json:"role"`
	ServedCount  int32   `json:"servedCount"`
	LastPickedOn *string `json:"lastPickedOn"`
}

// parsePresent parses the optional `present` query param — a comma-separated
// list of member UUIDs present tonight. Blank input (or blank segments) yields
// nil, which the handler passes as a NULL present-set (rank all active core).
func parsePresent(raw string) ([]uuid.UUID, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	parts := strings.Split(raw, ",")
	ids := make([]uuid.UUID, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		id, err := uuid.Parse(p)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return nil, nil
	}
	return ids, nil
}

// toTurnResponses maps sqlc rows to JSON responses, preserving the ranking
// order. It always returns a non-nil slice so an empty result encodes as [].
func toTurnResponses(rows []db.RankGroupTurnRow) []turnResponse {
	out := make([]turnResponse, 0, len(rows))
	for _, r := range rows {
		resp := turnResponse{
			ID:          r.ID.String(),
			Name:        r.Name,
			Role:        string(r.Role),
			ServedCount: r.ServedCount,
		}
		if r.LastPickedOn.Valid {
			s := r.LastPickedOn.Time.Format("2006-01-02")
			resp.LastPickedOn = &s
		}
		out = append(out, resp)
	}
	return out
}

// turnStore is the subset of *db.Queries the handler needs. The integration
// test passes the real *db.Queries, so no mock implementation is ever written.
type turnStore interface {
	RankGroupTurn(ctx context.Context, arg db.RankGroupTurnParams) ([]db.RankGroupTurnRow, error)
}

// turnHandler serves GET /groups/{groupId}/turn.
func turnHandler(store turnStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}
		present, err := parsePresent(r.URL.Query().Get("present"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid present id")
			return
		}

		rows, err := store.RankGroupTurn(r.Context(), db.RankGroupTurnParams{
			GroupID: gid,
			Present: present,
		})
		if err != nil {
			log.Printf("rank group turn (%s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID (canonical hex), not free-form input
			writeJSONError(w, http.StatusInternalServerError, "internal server error")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(toTurnResponses(rows)); err != nil {
			log.Printf("encode turn response (%s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID (canonical hex), not free-form input
		}
	}
}
