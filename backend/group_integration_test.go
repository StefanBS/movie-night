//go:build integration

package main

import (
	"net/http"
	"testing"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestGroupIntegration(t *testing.T) {
	pool := freshDB(t)
	seedFixtures(t, pool)
	q := db.New(pool)

	mux := http.NewServeMux()
	mux.Handle("GET /groups/{groupId}", getGroupHandler(q))
	mux.Handle("PATCH /groups/{groupId}", renameGroupHandler(q))

	const unknownGroup = "33333333-3333-3333-3333-333333333333"

	t.Run("GET returns the group's name and since date", func(t *testing.T) {
		code, g := doJSON[groupResponse](t, mux, http.MethodGet, "/groups/"+seededGroup, "")
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		if g.Name != "Friday Film Club" {
			t.Errorf("name = %q, want %q", g.Name, "Friday Film Club")
		}
		if len(g.CreatedOn) != len("2006-01-02") {
			t.Errorf("createdOn = %q, want a YYYY-MM-DD date", g.CreatedOn)
		}
	})

	t.Run("GET unknown group is 404", func(t *testing.T) {
		code, _ := doReq(t, mux, http.MethodGet, "/groups/"+unknownGroup, "")
		if code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", code)
		}
	})

	t.Run("GET malformed group id is 400", func(t *testing.T) {
		code, _ := doReq(t, mux, http.MethodGet, "/groups/not-a-uuid", "")
		if code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", code)
		}
	})

	t.Run("PATCH renames the group", func(t *testing.T) {
		code, g := doJSON[groupResponse](t, mux, http.MethodPatch, "/groups/"+seededGroup, `{"name":"  Saturday Cinema  "}`)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		if g.Name != "Saturday Cinema" {
			t.Errorf("name = %q, want trimmed %q", g.Name, "Saturday Cinema")
		}
		// The rename persists: a follow-up GET sees the new name.
		_, after := doJSON[groupResponse](t, mux, http.MethodGet, "/groups/"+seededGroup, "")
		if after.Name != "Saturday Cinema" {
			t.Errorf("after GET name = %q, want %q", after.Name, "Saturday Cinema")
		}
	})

	t.Run("PATCH empty name is 400", func(t *testing.T) {
		code, _ := doReq(t, mux, http.MethodPatch, "/groups/"+seededGroup, `{"name":"   "}`)
		if code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", code)
		}
	})

	t.Run("PATCH malformed body is 400", func(t *testing.T) {
		code, _ := doReq(t, mux, http.MethodPatch, "/groups/"+seededGroup, `{`)
		if code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", code)
		}
	})

	t.Run("PATCH unknown group is 404", func(t *testing.T) {
		code, _ := doReq(t, mux, http.MethodPatch, "/groups/"+unknownGroup, `{"name":"Ghosts"}`)
		if code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", code)
		}
	})
}
