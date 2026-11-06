package main

import (
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
	ServedCount  int32   `json:"servedCount"`
	LastPickedOn *string `json:"lastPickedOn"`
}

// parsePresent parses the optional `present` query param — a comma-separated
// list of member UUIDs present tonight. Blank input (or blank segments) yields
// nil, which the handler passes as a NULL present-set (rank all active core).
func parsePresent(raw string) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	for p := range strings.SplitSeq(raw, ",") {
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
	// A blank param leaves ids nil, which is the "rank all active core" signal.
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
			ServedCount: r.ServedCount,
		}
		if r.LastPickedOn.Valid {
			s := formatDay(r.LastPickedOn.Time)
			resp.LastPickedOn = &s
		}
		out = append(out, resp)
	}
	return out
}

// turnHandler serves GET /groups/{groupId}/turn.
func turnHandler(store *db.Queries) http.HandlerFunc {
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
			internalError(w, gid, "rank group turn", err)
			return
		}

		respondJSON(w, http.StatusOK, toTurnResponses(rows))
	}
}
