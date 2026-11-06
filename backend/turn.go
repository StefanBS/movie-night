package main

import (
	"net/http"

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

// turnHandler serves GET /groups/{groupId}/turn: every active core member,
// ranked. The app filters it to a draft's attendees itself, since who is
// present never changes the order (RankGroupTurn's ORDER BY ignores it).
func turnHandler(store *db.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}
		rows, err := store.RankGroupTurn(r.Context(), db.RankGroupTurnParams{GroupID: gid})
		if err != nil {
			internalError(w, gid, "rank group turn", err)
			return
		}

		respondJSON(w, http.StatusOK, toTurnResponses(rows))
	}
}
