//go:build integration

package main

import (
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
			{"id":438631,"title":"Dune","release_date":"2021-10-22","poster_path":"/dune.jpg"},
			{"id":841,"title":"Dune","release_date":"1984-12-14","poster_path":"/dune84.jpg"}
		]}`))
	})
	mux.HandleFunc("/movie/438631", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":438631,"title":"Dune","release_date":"2021-10-22","poster_path":"/dune.jpg"}`))
	})
	mux.HandleFunc("/movie/841", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":841,"title":"Dune","release_date":"1984-12-14","poster_path":"/dune84.jpg"}`))
	})
	// A movie TMDB knows but with no poster (poster_path null).
	mux.HandleFunc("/movie/555", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":555,"title":"No Poster","release_date":"2000-01-01","poster_path":null}`))
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
	pool := freshDB(t)
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
		return doReq(t, mux, method, path, body)
	}

	// mkNight clears the group's picks (one open night per group) and creates a
	// fresh attendee-less night, returning its id. Attaching a movie needs only a
	// night to exist — no picker or attendee.
	mkNight := func(t *testing.T, group string) string {
		t.Helper()
		clearAllPicks(t, pool, group)
		code, n := doJSON[nightResponse](t, mux, http.MethodPost, "/groups/"+group+"/nights", `{"scheduledFor":"2026-06-12"}`)
		if code != http.StatusCreated {
			t.Fatalf("create night = %d", code)
		}
		return n.ID
	}

	attach := func(t *testing.T, group, nightID, body string) (int, nightResponse) {
		t.Helper()
		return doJSON[nightResponse](t, mux, http.MethodPost, "/groups/"+group+"/nights/"+nightID+"/movie", body)
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
		if got[0].PosterURL == nil || *got[0].PosterURL != "https://image.tmdb.org/t/p/w342/dune.jpg" {
			t.Fatalf("search poster = %v, want built w342 url", got[0].PosterURL)
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
		if n.Movie.PosterURL == nil || *n.Movie.PosterURL != "https://image.tmdb.org/t/p/w342/dune.jpg" {
			t.Fatalf("night poster = %v, want built w342 url", n.Movie.PosterURL)
		}
		var poster *string
		if err := pool.QueryRow(context.Background(),
			"SELECT poster_path FROM movies WHERE tmdb_id=438631").Scan(&poster); err != nil {
			t.Fatalf("read poster_path: %v", err)
		}
		if poster == nil || *poster != "/dune.jpg" {
			t.Fatalf("stored poster_path = %v, want /dune.jpg", poster)
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

	t.Run("attach a movie with no poster yields null posterUrl", func(t *testing.T) {
		night := mkNight(t, seededGroup)
		code, n := attach(t, seededGroup, night, `{"tmdbId":555}`)
		if code != http.StatusOK {
			t.Fatalf("attach status = %d, want 200", code)
		}
		if n.Movie == nil || n.Movie.PosterURL != nil {
			t.Fatalf("night poster = %+v, want nil", n.Movie)
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
		if code, _ := doReq(t, searchMoviesHandler(nilClient), http.MethodGet, "/movies/search?q=dune", ""); code != http.StatusServiceUnavailable {
			t.Errorf("search unconfigured = %d, want 503", code)
		}
		// Drive attach through a router so {groupId}/{nightId} path values populate;
		// with a nil client the handler must 503 after ensureNight passes.
		night := mkNight(t, seededGroup)
		m2 := http.NewServeMux()
		m2.Handle("POST /groups/{groupId}/nights/{nightId}/movie", recordNightMovieHandler(q, nilClient))
		if code, _ := doReq(t, m2, http.MethodPost,
			"/groups/"+seededGroup+"/nights/"+night+"/movie", `{"tmdbId":438631}`); code != http.StatusServiceUnavailable {
			t.Errorf("attach unconfigured = %d, want 503", code)
		}
	})
}
