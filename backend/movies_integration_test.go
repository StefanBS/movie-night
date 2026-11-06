//go:build integration

package main

import (
	"context"
	"maps"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
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
		_, _ = w.Write([]byte(`{"id":438631,"title":"Dune","release_date":"2021-10-22","poster_path":"/dune.jpg",
			"genres":[{"id":878,"name":"Science Fiction"},{"id":12,"name":"Adventure"}],"runtime":155}`))
	})
	mux.HandleFunc("/movie/841", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":841,"title":"Dune","release_date":"1984-12-14","poster_path":"/dune84.jpg"}`))
	})
	// A movie TMDB knows but with no poster, genres or runtime.
	mux.HandleFunc("/movie/555", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":555,"title":"No Poster","release_date":"2000-01-01","poster_path":null,"genres":[],"runtime":0}`))
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

	mux := newRoutes(pool, client)

	// seedNight inserts a Night Ada picks on date, with her attending, and
	// returns its id. Attaching a movie needs only a Night to exist, so it is
	// seeded directly rather than through create.
	seedNight := func(t *testing.T, date string) string {
		t.Helper()
		var id string
		if err := pool.QueryRow(context.Background(),
			`WITH night AS (
				INSERT INTO nights (group_id, picker_id, scheduled_for) VALUES ($1, $2, $3) RETURNING id, group_id, picker_id
			), attended AS (
				INSERT INTO attendances (night_id, group_id, user_id) SELECT id, group_id, picker_id FROM night
			)
			SELECT id FROM night`,
			seededGroup, ada, date).Scan(&id); err != nil {
			t.Fatalf("seed night: %v", err)
		}
		return id
	}
	// mkNight clears the group's nights and seeds a fresh one.
	mkNight := func(t *testing.T) string {
		t.Helper()
		clearAllPicks(t, pool, seededGroup)
		return seedNight(t, "2026-06-12")
	}

	t.Run("search returns mapped results", func(t *testing.T) {
		code, got := doJSON[[]searchResultDTO](t, mux, http.MethodGet, "/groups/"+seededGroup+"/movies/search?q=dune", "")
		if code != http.StatusOK {
			t.Fatalf("search status = %d, want 200", code)
		}
		if len(got) != 2 || got[0].TMDBID != 438631 || got[0].Title != "Dune" ||
			got[0].ReleaseYear == nil || *got[0].ReleaseYear != 2021 {
			t.Fatalf("results = %+v", got)
		}
		if got[0].PosterURL == nil || *got[0].PosterURL != "https://image.tmdb.org/t/p/w342/dune.jpg" {
			t.Fatalf("search poster = %v, want built w342 url", got[0].PosterURL)
		}
		if got[0].Genres == nil || len(got[0].Genres) != 0 || got[0].RuntimeMinutes != nil {
			t.Fatalf("search genres/runtime = %#v/%v, want []/nil", got[0].Genres, got[0].RuntimeMinutes)
		}
	})

	t.Run("search says when the group last watched each result", func(t *testing.T) {
		// Dune (438631) watched twice, the 1984 Dune (841) attached but not
		// yet watched.
		earlier := mkNight(t)
		attachMovie(t, mux, seededGroup, earlier, `{"tmdbId":438631}`)
		later := seedNight(t, "2026-07-03")
		attachMovie(t, mux, seededGroup, later, `{"tmdbId":438631}`)
		planned := seedNight(t, "2026-08-07")
		attachMovie(t, mux, seededGroup, planned, `{"tmdbId":841}`)
		if _, err := pool.Exec(context.Background(),
			"UPDATE nights SET watched_at = now() WHERE id = ANY($1::uuid[])", []string{earlier, later}); err != nil {
			t.Fatalf("mark watched: %v", err)
		}

		// watchedOn returns each result's watchedOn by tmdbId ("" for null).
		watchedOn := func(t *testing.T, group, query string) map[int32]string {
			t.Helper()
			code, got := doJSON[[]searchResultDTO](t, mux, http.MethodGet, "/groups/"+group+"/movies/search?q=dune"+query, "")
			if code != http.StatusOK {
				t.Fatalf("search status = %d, want 200", code)
			}
			out := map[int32]string{}
			for _, r := range got {
				out[r.TMDBID] = ""
				if r.WatchedOn != nil {
					out[r.TMDBID] = *r.WatchedOn
				}
			}
			return out
		}
		for _, tc := range []struct {
			name, group, query string
			want               map[int32]string
		}{
			{"the latest watched night's date; a planned film is null", seededGroup, "",
				map[int32]string{438631: "2026-07-03", 841: ""}},
			{"the night being edited doesn't count", seededGroup, "&exceptNight=" + later,
				map[int32]string{438631: "2026-06-12", 841: ""}},
			{"excepting a planned night changes nothing", seededGroup, "&exceptNight=" + planned,
				map[int32]string{438631: "2026-07-03", 841: ""}},
			{"another group's nights don't count", emptyGroup, "",
				map[int32]string{438631: "", 841: ""}},
		} {
			if got := watchedOn(t, tc.group, tc.query); !maps.Equal(got, tc.want) {
				t.Errorf("%s: watchedOn = %v, want %v", tc.name, got, tc.want)
			}
		}

		if code, _ := doReq(t, mux, http.MethodGet, "/groups/"+seededGroup+"/movies/search?q=dune&exceptNight=nope", ""); code != http.StatusBadRequest {
			t.Errorf("bad exceptNight status = %d, want 400", code)
		}
		if code, _ := doReq(t, mux, http.MethodGet, "/groups/nope/movies/search?q=dune", ""); code != http.StatusBadRequest {
			t.Errorf("bad group id status = %d, want 400", code)
		}
	})

	// movieDetails reads a cached movie's stored genres and runtime.
	movieDetails := func(t *testing.T, tmdbID int) ([]string, *int32) {
		t.Helper()
		var genres []string
		var runtime *int32
		if err := pool.QueryRow(context.Background(),
			"SELECT genres, runtime_minutes FROM movies WHERE tmdb_id=$1", tmdbID).Scan(&genres, &runtime); err != nil {
			t.Fatalf("read movie details: %v", err)
		}
		return genres, runtime
	}

	t.Run("attach stores and returns genres and runtime", func(t *testing.T) {
		night := mkNight(t)
		code, n := attachMovie(t, mux, seededGroup, night, `{"tmdbId":438631}`)
		if code != http.StatusOK {
			t.Fatalf("attach status = %d, want 200", code)
		}
		want := []string{"Science Fiction", "Adventure"}
		if n.Movie == nil || !slices.Equal(n.Movie.Genres, want) ||
			n.Movie.RuntimeMinutes == nil || *n.Movie.RuntimeMinutes != 155 {
			t.Fatalf("night movie = %+v, want genres %v and runtime 155", n.Movie, want)
		}
		genres, runtime := movieDetails(t, 438631)
		if !slices.Equal(genres, want) || runtime == nil || *runtime != 155 {
			t.Fatalf("stored genres/runtime = %v/%v", genres, runtime)
		}
		// The detail read goes through the full_nights view too.
		code, got := doJSON[nightResponse](t, mux, http.MethodGet, "/groups/"+seededGroup+"/nights/"+night, "")
		if code != http.StatusOK || got.Movie == nil || !slices.Equal(got.Movie.Genres, want) ||
			got.Movie.RuntimeMinutes == nil || *got.Movie.RuntimeMinutes != 155 {
			t.Fatalf("detail status %d movie = %+v", code, got.Movie)
		}
	})

	t.Run("no genres and runtime 0 store {} and return [] and null", func(t *testing.T) {
		night := mkNight(t)
		_, n := attachMovie(t, mux, seededGroup, night, `{"tmdbId":555}`)
		if n.Movie == nil || n.Movie.Genres == nil || len(n.Movie.Genres) != 0 || n.Movie.RuntimeMinutes != nil {
			t.Fatalf("night movie = %+v, want genres [] and runtime nil", n.Movie)
		}
		genres, runtime := movieDetails(t, 555)
		if genres == nil || len(genres) != 0 || runtime != nil {
			t.Fatalf("stored genres/runtime = %#v/%v, want {}/NULL", genres, runtime)
		}
	})

	t.Run("re-attach refreshes stale genres and runtime", func(t *testing.T) {
		night := mkNight(t)
		attachMovie(t, mux, seededGroup, night, `{"tmdbId":438631}`)
		if _, err := pool.Exec(context.Background(),
			"UPDATE movies SET genres='{Stale}', runtime_minutes=1 WHERE tmdb_id=438631"); err != nil {
			t.Fatalf("stale movie: %v", err)
		}
		_, n := attachMovie(t, mux, seededGroup, night, `{"tmdbId":438631}`)
		if n.Movie == nil || !slices.Equal(n.Movie.Genres, []string{"Science Fiction", "Adventure"}) ||
			n.Movie.RuntimeMinutes == nil || *n.Movie.RuntimeMinutes != 155 {
			t.Fatalf("night movie after re-attach = %+v", n.Movie)
		}
	})

	t.Run("a movie with no genres or runtime returns [] and null", func(t *testing.T) {
		night := mkNight(t)
		// TMDB can know a film without its genres or runtime.
		if _, err := pool.Exec(context.Background(), `
			WITH m AS (INSERT INTO movies (tmdb_id, title) VALUES (777, 'Sparse Film') RETURNING id)
			UPDATE nights SET movie_id = (SELECT id FROM m) WHERE id = $1`, night); err != nil {
			t.Fatalf("seed sparse movie: %v", err)
		}
		code, got := doJSON[nightResponse](t, mux, http.MethodGet, "/groups/"+seededGroup+"/nights/"+night, "")
		if code != http.StatusOK || got.Movie == nil || got.Movie.Title != "Sparse Film" ||
			got.Movie.Genres == nil || len(got.Movie.Genres) != 0 || got.Movie.RuntimeMinutes != nil {
			t.Fatalf("detail status %d movie = %+v, want genres [] and runtime nil", code, got.Movie)
		}
	})

	t.Run("a night with no film returns movie null", func(t *testing.T) {
		night := mkNight(t)
		code, got := doJSON[nightResponse](t, mux, http.MethodGet, "/groups/"+seededGroup+"/nights/"+night, "")
		if code != http.StatusOK || got.Movie != nil {
			t.Fatalf("detail status %d movie = %+v, want nil", code, got.Movie)
		}
	})

	t.Run("attach sets the movie on the night and caches it", func(t *testing.T) {
		night := mkNight(t)
		code, n := attachMovie(t, mux, seededGroup, night, `{"tmdbId":438631}`)
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
		if n.Movie.PosterThumbURL == nil || *n.Movie.PosterThumbURL != "https://image.tmdb.org/t/p/w154/dune.jpg" {
			t.Fatalf("night thumb = %v, want built w154 url", n.Movie.PosterThumbURL)
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
		night := mkNight(t)
		code, n := attachMovie(t, mux, seededGroup, night, `{"tmdbId":555}`)
		if code != http.StatusOK {
			t.Fatalf("attach status = %d, want 200", code)
		}
		if n.Movie == nil || n.Movie.PosterURL != nil {
			t.Fatalf("night poster = %+v, want nil", n.Movie)
		}
	})

	t.Run("re-attach a different movie updates the night (correction)", func(t *testing.T) {
		night := mkNight(t)
		attachMovie(t, mux, seededGroup, night, `{"tmdbId":438631}`)
		code, n := attachMovie(t, mux, seededGroup, night, `{"tmdbId":841}`)
		if code != http.StatusOK {
			t.Fatalf("re-attach status = %d, want 200", code)
		}
		if n.Movie == nil || n.Movie.TMDBID != 841 || n.Movie.ReleaseYear == nil || *n.Movie.ReleaseYear != 1984 {
			t.Fatalf("night movie after correction = %+v, want the 1984 Dune", n.Movie)
		}
	})

	t.Run("same tmdbId on two nights reuses one movies row", func(t *testing.T) {
		n1 := mkNight(t)
		attachMovie(t, mux, seededGroup, n1, `{"tmdbId":438631}`)
		n2 := seedNight(t, "2026-06-13") // a genuinely separate night
		attachMovie(t, mux, seededGroup, n2, `{"tmdbId":438631}`)
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
		night := mkNight(t)
		if code, _ := attachMovie(t, mux, seededGroup, night, `{"tmdbId":999999}`); code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", code)
		}
	})

	t.Run("malformed body and unknown night", func(t *testing.T) {
		night := mkNight(t)
		if code, _ := attachMovie(t, mux, seededGroup, night, `{"tmdbId":0}`); code != http.StatusBadRequest {
			t.Errorf("non-positive tmdbId status = %d, want 400", code)
		}
		if code, _ := attachMovie(t, mux, seededGroup, unknownNight, `{"tmdbId":438631}`); code != http.StatusNotFound {
			t.Errorf("unknown-night status = %d, want 404", code)
		}
	})

	t.Run("unconfigured TMDB yields 503", func(t *testing.T) {
		// Drive both through a router so the {groupId}/{nightId} path values
		// populate; with a nil client attach must 503 after loadNight passes.
		m2 := newRoutes(pool, nil)
		if code, _ := doReq(t, m2, http.MethodGet, "/groups/"+seededGroup+"/movies/search?q=dune", ""); code != http.StatusServiceUnavailable {
			t.Errorf("search unconfigured = %d, want 503", code)
		}
		night := mkNight(t)
		if code, _ := doReq(t, m2, http.MethodPost,
			"/groups/"+seededGroup+"/nights/"+night+"/movie", `{"tmdbId":438631}`); code != http.StatusServiceUnavailable {
			t.Errorf("attach unconfigured = %d, want 503", code)
		}
	})
}
