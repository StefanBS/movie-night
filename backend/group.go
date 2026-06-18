package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// validateGroupName trims and requires a non-empty name, mirroring validateJoin's
// name handling. Pure — no DB.
func validateGroupName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" {
		return "", fmt.Errorf("name is required")
	}
	return name, nil
}

// updateGroupRequest is the JSON body of PATCH /groups/{groupId}. Name is the
// only editable field today.
type updateGroupRequest struct {
	Name string `json:"name"`
}

// groupResponse is the JSON shape for the group resource: its display name and
// creation date. CreatedOn is created_at as YYYY-MM-DD (the joinedOn/scheduledFor
// convention); the app labels it "since".
type groupResponse struct {
	Name      string `json:"name"`
	CreatedOn string `json:"createdOn"`
}

// toGroupResponse maps a groups row to the DTO, reusing memberDate to render the
// timestamptz as a calendar date.
func toGroupResponse(g db.Group) groupResponse {
	return groupResponse{
		Name:      g.Name,
		CreatedOn: memberDate(g.CreatedAt),
	}
}

// groupStore is the subset of *db.Queries the group handlers need; the real
// *db.Queries satisfies it, so no mock is ever written (same pattern as
// memberStore/nightStore/turnStore).
type groupStore interface {
	GetGroup(ctx context.Context, id uuid.UUID) (db.Group, error)
	RenameGroup(ctx context.Context, arg db.RenameGroupParams) (db.Group, error)
}

// getGroupHandler serves GET /groups/{groupId} — the group's name and since
// date; 404 when the group does not exist.
func getGroupHandler(store groupStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}
		g, err := store.GetGroup(r.Context(), gid)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeJSONError(w, http.StatusNotFound, "group not found")
				return
			}
			internalError(w, gid, "get group", err)
			return
		}
		respondJSON(w, http.StatusOK, toGroupResponse(g), gid, "encode group response")
	}
}

// renameGroupHandler serves PATCH /groups/{groupId} — renames the group. The
// update's empty result set (unknown group) surfaces as pgx.ErrNoRows → 404.
func renameGroupHandler(store groupStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}
		req, ok := decodeJSON[updateGroupRequest](w, r)
		if !ok {
			return
		}
		name, err := validateGroupName(req.Name)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		g, err := store.RenameGroup(r.Context(), db.RenameGroupParams{ID: gid, Name: name})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeJSONError(w, http.StatusNotFound, "group not found")
				return
			}
			internalError(w, gid, "rename group", err)
			return
		}
		respondJSON(w, http.StatusOK, toGroupResponse(g), gid, "encode group response")
	}
}
