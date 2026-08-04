//go:build integration

package main

import (
	"net/http"
	"testing"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestNightEditsIntegration(t *testing.T) {
	pool := freshDB(t)
	seedFixtures(t, pool)

	upstream := fakeTMDB(t)
	client := &tmdbClient{baseURL: upstream.URL, token: "test", client: upstream.Client()}

	mux := http.NewServeMux()
	q := db.New(pool)
	mux.Handle("POST /groups/{groupId}/nights", createNightHandler(q))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}", nightDetailHandler(q))
	mux.Handle("PATCH /groups/{groupId}/nights/{nightId}", updateNightDateHandler(q))
	mux.Handle("DELETE /groups/{groupId}/nights/{nightId}", deleteNightHandler(q))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/pick", recordNightPickHandler(q))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/movie", recordNightMovieHandler(q, client))
	mux.Handle("DELETE /groups/{groupId}/nights/{nightId}/movie", clearNightMovieHandler(q))

	const ada = "a0000000-0000-0000-0000-000000000001"

	do := func(t *testing.T, method, path, body string) (int, []byte) {
		t.Helper()
		return doReq(t, mux, method, path, body)
	}

	mkNight := func(t *testing.T) nightResponse {
		t.Helper()
		clearOpenNight(t, pool, seededGroup)
		code, n := doJSON[nightResponse](t, mux, http.MethodPost, "/groups/"+seededGroup+"/nights",
			`{"scheduledFor":"2026-06-12","attendees":["`+ada+`"]}`)
		if code != http.StatusCreated {
			t.Fatalf("create night = %d", code)
		}
		code, n = doJSON[nightResponse](t, mux, http.MethodPost, "/groups/"+seededGroup+"/nights/"+n.ID+"/pick",
			`{"pickerId":"`+ada+`"}`)
		if code != http.StatusOK {
			t.Fatalf("record pick = %d", code)
		}
		return n
	}

	t.Run("PATCH changes scheduledFor", func(t *testing.T) {
		n := mkNight(t)
		code, got := doJSON[nightResponse](t, mux, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			`{"scheduledFor":"2026-07-04"}`)
		if code != http.StatusOK {
			t.Fatalf("patch status = %d, want 200", code)
		}
		if got.ScheduledFor != "2026-07-04" {
			t.Fatalf("scheduledFor = %q, want 2026-07-04", got.ScheduledFor)
		}
	})

	t.Run("PATCH bad date yields 400", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID, `{"scheduledFor":"nope"}`); code != http.StatusBadRequest {
			t.Fatalf("bad date status = %d, want 400", code)
		}
	})

	t.Run("DELETE movie detaches film", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := attachMovie(t, mux, seededGroup, n.ID, `{"tmdbId":438631}`); code != http.StatusOK {
			t.Fatalf("attach status = %d, want 200", code)
		}
		code, got := doJSON[nightResponse](t, mux, http.MethodDelete, "/groups/"+seededGroup+"/nights/"+n.ID+"/movie", "")
		if code != http.StatusOK {
			t.Fatalf("clear status = %d, want 200", code)
		}
		if got.Movie != nil {
			t.Fatalf("movie = %+v, want null", got.Movie)
		}
	})

	t.Run("DELETE movie is idempotent when no film", func(t *testing.T) {
		n := mkNight(t)
		code, got := doJSON[nightResponse](t, mux, http.MethodDelete, "/groups/"+seededGroup+"/nights/"+n.ID+"/movie", "")
		if code != http.StatusOK {
			t.Fatalf("clear status = %d, want 200", code)
		}
		if got.Movie != nil {
			t.Fatalf("movie = %+v, want null", got.Movie)
		}
	})

	t.Run("DELETE night removes it", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodDelete, "/groups/"+seededGroup+"/nights/"+n.ID, ""); code != http.StatusNoContent {
			t.Fatalf("delete status = %d, want 204", code)
		}
		if code, _ := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/"+n.ID, ""); code != http.StatusNotFound {
			t.Fatalf("get after delete = %d, want 404", code)
		}
	})

	t.Run("DELETE night is idempotent", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodDelete, "/groups/"+seededGroup+"/nights/"+n.ID, ""); code != http.StatusNoContent {
			t.Fatalf("first delete = %d, want 204", code)
		}
		if code, _ := do(t, http.MethodDelete, "/groups/"+seededGroup+"/nights/"+n.ID, ""); code != http.StatusNoContent {
			t.Fatalf("second delete = %d, want 204", code)
		}
	})
}

func attachMovie(t *testing.T, mux http.Handler, group, nightID, body string) (int, nightResponse) {
	t.Helper()
	return doJSON[nightResponse](t, mux, http.MethodPost, "/groups/"+group+"/nights/"+nightID+"/movie", body)
}
