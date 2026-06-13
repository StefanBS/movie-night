//go:build integration

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// fakeTMDB mimics the two TMDB endpoints this app calls, so the real tmdbClient
// is exercised over real HTTP against a controlled upstream — no network, no key.
func fakeTMDB(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/search/movie", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"results":[
			{"id":438631,"title":"Dune","release_date":"2021-10-22"},
			{"id":841,"title":"Dune","release_date":"1984-12-14"}
		]}`))
	})
	mux.HandleFunc("/movie/438631", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":438631,"title":"Dune","release_date":"2021-10-22"}`))
	})
	mux.HandleFunc("/movie/841", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":841,"title":"Dune","release_date":"1984-12-14"}`))
	})
	// Any other /movie/{id} → 404 (unknown movie).
	mux.HandleFunc("/movie/", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestMovieAttachIntegration(t *testing.T) {
	pool := startPostgres(t)
	seedFixtures(t, pool)
	upstream := fakeTMDB(t)
	client := &tmdbClient{baseURL: upstream.URL, token: "test", client: upstream.Client()}

	q := db.New(pool)
	mux := http.NewServeMux()
	mux.Handle("POST /groups/{groupId}/nights", createNightHandler(q))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}", nightDetailHandler(q))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/movie", recordNightMovieHandler(q, client))
	mux.Handle("GET /movies/search", searchMoviesHandler(client))

	do := func(t *testing.T, method, path, body string) (int, []byte) {
		t.Helper()
		rec := httptest.NewRecorder()
		var r *http.Request
		if body == "" {
			r = httptest.NewRequest(method, path, nil)
		} else {
			r = httptest.NewRequest(method, path, bytes.NewBufferString(body))
		}
		mux.ServeHTTP(rec, r)
		return rec.Code, rec.Body.Bytes()
	}

	// mkNight clears the group's picks (one open night per group) and creates a
	// fresh attendee-less night, returning its id. Attaching a movie needs only a
	// night to exist — no picker or attendee.
	mkNight := func(t *testing.T, group string) string {
		t.Helper()
		if _, err := pool.Exec(context.Background(), "DELETE FROM picks WHERE group_id=$1", group); err != nil {
			t.Fatalf("clear picks: %v", err)
		}
		code, b := do(t, http.MethodPost, "/groups/"+group+"/nights", `{"scheduledFor":"2026-06-12"}`)
		if code != http.StatusCreated {
			t.Fatalf("create night = %d (%s)", code, b)
		}
		var n nightResponse
		if err := json.Unmarshal(b, &n); err != nil {
			t.Fatalf("decode night: %v", err)
		}
		return n.ID
	}

	attach := func(t *testing.T, group, nightID, body string) (int, nightResponse) {
		t.Helper()
		code, b := do(t, http.MethodPost, "/groups/"+group+"/nights/"+nightID+"/movie", body)
		var n nightResponse
		if code == http.StatusOK {
			if err := json.Unmarshal(b, &n); err != nil {
				t.Fatalf("decode night: %v", err)
			}
		}
		return code, n
	}

	t.Run("search returns mapped results", func(t *testing.T) {
		code, b := do(t, http.MethodGet, "/movies/search?q=dune", "")
		if code != http.StatusOK {
			t.Fatalf("search status = %d, want 200 (%s)", code, b)
		}
		var got []movieDTO
		if err := json.Unmarshal(b, &got); err != nil {
			t.Fatalf("decode results: %v", err)
		}
		if len(got) != 2 || got[0].TMDBID != 438631 || got[0].Title != "Dune" ||
			got[0].ReleaseYear == nil || *got[0].ReleaseYear != 2021 {
			t.Fatalf("results = %+v", got)
		}
	})

	t.Run("attach sets the movie on the night and caches it", func(t *testing.T) {
		night := mkNight(t, seededGroup)
		code, n := attach(t, seededGroup, night, `{"tmdbId":438631}`)
		if code != http.StatusOK {
			t.Fatalf("attach status = %d, want 200", code)
		}
		if n.Movie == nil || n.Movie.TMDBID != 438631 || n.Movie.Title != "Dune" ||
			n.Movie.ReleaseYear == nil || *n.Movie.ReleaseYear != 2021 {
			t.Fatalf("night movie = %+v", n.Movie)
		}
		var count int
		if err := pool.QueryRow(context.Background(),
			"SELECT count(*) FROM movies WHERE tmdb_id=438631").Scan(&count); err != nil {
			t.Fatalf("count movies: %v", err)
		}
		if count != 1 {
			t.Fatalf("movies rows for tmdb 438631 = %d, want 1", count)
		}
	})

	t.Run("re-attach a different movie updates the night (correction)", func(t *testing.T) {
		night := mkNight(t, seededGroup)
		attach(t, seededGroup, night, `{"tmdbId":438631}`)
		code, n := attach(t, seededGroup, night, `{"tmdbId":841}`)
		if code != http.StatusOK {
			t.Fatalf("re-attach status = %d, want 200", code)
		}
		if n.Movie == nil || n.Movie.TMDBID != 841 || n.Movie.ReleaseYear == nil || *n.Movie.ReleaseYear != 1984 {
			t.Fatalf("night movie after correction = %+v, want the 1984 Dune", n.Movie)
		}
	})

	t.Run("same tmdbId on two nights reuses one movies row", func(t *testing.T) {
		n1 := mkNight(t, seededGroup)
		attach(t, seededGroup, n1, `{"tmdbId":438631}`)
		n2 := mkNight(t, emptyGroup) // a second group → a genuinely separate night
		attach(t, emptyGroup, n2, `{"tmdbId":438631}`)
		var count int
		if err := pool.QueryRow(context.Background(),
			"SELECT count(*) FROM movies WHERE tmdb_id=438631").Scan(&count); err != nil {
			t.Fatalf("count movies: %v", err)
		}
		if count != 1 {
			t.Fatalf("movies rows for tmdb 438631 = %d, want 1 (upsert)", count)
		}
	})

	t.Run("unknown tmdbId yields 404", func(t *testing.T) {
		night := mkNight(t, seededGroup)
		if code, _ := attach(t, seededGroup, night, `{"tmdbId":999999}`); code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", code)
		}
	})

	t.Run("malformed body and unknown night", func(t *testing.T) {
		night := mkNight(t, seededGroup)
		if code, _ := attach(t, seededGroup, night, `{"tmdbId":0}`); code != http.StatusBadRequest {
			t.Errorf("non-positive tmdbId status = %d, want 400", code)
		}
		missing := "b0000000-0000-0000-0000-0000000000ee"
		if code, _ := attach(t, seededGroup, missing, `{"tmdbId":438631}`); code != http.StatusNotFound {
			t.Errorf("unknown-night status = %d, want 404", code)
		}
	})

	t.Run("unconfigured TMDB yields 503", func(t *testing.T) {
		var nilClient *tmdbClient
		rec := httptest.NewRecorder()
		searchMoviesHandler(nilClient).ServeHTTP(rec,
			httptest.NewRequest(http.MethodGet, "/movies/search?q=dune", nil))
		if rec.Code != http.StatusServiceUnavailable {
			t.Errorf("search unconfigured = %d, want 503", rec.Code)
		}
		// Drive attach through a router so {groupId}/{nightId} path values populate;
		// with a nil client the handler must 503 after ensureNight passes.
		night := mkNight(t, seededGroup)
		m2 := http.NewServeMux()
		m2.Handle("POST /groups/{groupId}/nights/{nightId}/movie", recordNightMovieHandler(q, nilClient))
		rec = httptest.NewRecorder()
		m2.ServeHTTP(rec, httptest.NewRequest(http.MethodPost,
			"/groups/"+seededGroup+"/nights/"+night+"/movie", bytes.NewBufferString(`{"tmdbId":438631}`)))
		if rec.Code != http.StatusServiceUnavailable {
			t.Errorf("attach unconfigured = %d, want 503", rec.Code)
		}
	})
}
