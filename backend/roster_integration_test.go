//go:build integration

package main

import (
	"net/http"
	"testing"
	"time"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestMembersHandlerIntegration(t *testing.T) {
	pool := freshDB(t)
	seedFixtures(t, pool)

	mux := http.NewServeMux()
	mux.Handle("GET /groups/{groupId}/members", membersHandler(db.New(pool)))

	get := func(groupID string) (int, []memberResponse) {
		return doJSON[[]memberResponse](t, mux, http.MethodGet, "/groups/"+groupID+"/members", "")
	}

	t.Run("all members ordered core, guest, then inactive", func(t *testing.T) {
		code, got := get(seededGroup)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		want := []memberResponse{
			{Name: "Ada", Role: "core", Status: "active"},
			{Name: "Blake", Role: "core", Status: "active"},
			{Name: "Cleo", Role: "core", Status: "active"},
			{Name: "Frankie", Role: "guest", Status: "active"},
			{Name: "Zed", Role: "core", Status: "inactive"},
		}
		if len(got) != len(want) {
			t.Fatalf("got %d members, want %d (%+v)", len(got), len(want), got)
		}
		for i, w := range want {
			if got[i].Name != w.Name || got[i].Role != w.Role || got[i].Status != w.Status {
				t.Errorf("[%d] = {%s %s %s}, want {%s %s %s}", i,
					got[i].Name, got[i].Role, got[i].Status, w.Name, w.Role, w.Status)
			}
		}
		for i := range got {
			if _, err := time.Parse("2006-01-02", got[i].JoinedOn); err != nil {
				t.Errorf("[%d] %s joinedOn = %q, want a YYYY-MM-DD date: %v", i, got[i].Name, got[i].JoinedOn, err)
			}
		}
	})

	t.Run("valid but unknown group returns empty array", func(t *testing.T) {
		code, got := get(emptyGroup)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		if len(got) != 0 {
			t.Fatalf("got %d members, want 0", len(got))
		}
	})

	t.Run("malformed group id returns 400", func(t *testing.T) {
		code, _ := get("not-a-uuid")
		if code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", code)
		}
	})
}
