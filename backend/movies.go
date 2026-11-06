package main

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// This file holds the movie concern: the movie DTO, the row/param mappers
// between the movies table and TMDB, and the movie endpoints (the TMDB search
// proxy, which adds when the group watched each result, and attaching and
// clearing a night's film, whose writes run in night_writes.go). It sits next to tmdb.go; the night lifecycle in
// nights.go embeds a movieDTO in its response but otherwise stays separate.

// movieDTO is the JSON shape for an attached movie (and a search result's film).
// ReleaseYear is null when TMDB has no release date. int32 matches the movies
// table and TMDB's domain (ids/years fit in 32 bits); JSON renders it as a number.
// Genres is always an array (never null); RuntimeMinutes is null when unknown.
// Search results carry neither, so they return [] and null.
type movieDTO struct {
	TMDBID         int32    `json:"tmdbId"`
	Title          string   `json:"title"`
	ReleaseYear    *int32   `json:"releaseYear"`
	PosterURL      *string  `json:"posterUrl"`
	PosterThumbURL *string  `json:"posterThumbUrl"`
	Genres         []string `json:"genres"`
	RuntimeMinutes *int32   `json:"runtimeMinutes"`
}

// genresOrEmpty renders genres as a JSON array, never null.
func genresOrEmpty(g []string) []string {
	if g == nil {
		return []string{}
	}
	return g
}

// nullableInt32 renders a nullable integer column (release year, runtime) as
// *int32 (nil → JSON null).
func nullableInt32(v pgtype.Int4) *int32 {
	if !v.Valid {
		return nil
	}
	y := v.Int32
	return &y
}

// posterURLPtr builds the poster URL at a size for a cached movie row, nil when
// NULL.
func posterURLPtr(size string, p pgtype.Text) *string {
	if !p.Valid {
		return nil
	}
	return posterURL(size, p.String)
}

// movieRequest is the JSON body of POST .../nights/{nightId}/movie. Only the
// tmdbId is sent; the backend re-fetches canonical title/year from TMDB.
type movieRequest struct {
	TMDBID int `json:"tmdbId"`
}

// validateMovieRequest checks the attach body. Pure.
func validateMovieRequest(req movieRequest) error {
	if req.TMDBID <= 0 {
		return fmt.Errorf("invalid tmdbId")
	}
	return nil
}

// int4Ptr maps an optional int32 (release year, runtime) to pgtype.Int4 for UpsertMovie.
func int4Ptr(v *int32) pgtype.Int4 {
	if v == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: *v, Valid: true}
}

// searchResultDTO is one film search result: the movie, plus when the group
// last watched it (scheduledFor of its latest Watched Night), or null.
type searchResultDTO struct {
	movieDTO
	WatchedOn *string `json:"watchedOn"`
}

// toSearchResults maps TMDB search hits to the JSON DTO (always non-nil → []),
// joining in watchedOn by tmdbId. Pure.
func toSearchResults(results []movieResult, watchedOn map[int32]string) []searchResultDTO {
	out := make([]searchResultDTO, 0, len(results))
	for _, m := range results {
		res := searchResultDTO{movieDTO: movieDTO{
			TMDBID:         m.TMDBID,
			Title:          m.Title,
			ReleaseYear:    m.ReleaseYear,
			PosterURL:      posterURL(posterSize, m.PosterPath),
			PosterThumbURL: posterURL(thumbSize, m.PosterPath),
			Genres:         genresOrEmpty(m.Genres),
			RuntimeMinutes: m.RuntimeMinutes,
		}}
		if day, ok := watchedOn[m.TMDBID]; ok {
			res.WatchedOn = &day
		}
		out = append(out, res)
	}
	return out
}

// tmdbIDs lists the results' TMDB ids, for the watchedOn lookup. Pure.
func tmdbIDs(results []movieResult) []int32 {
	ids := make([]int32, 0, len(results))
	for _, m := range results {
		ids = append(ids, m.TMDBID)
	}
	return ids
}

// searchMoviesHandler serves GET /groups/{groupId}/movies/search?q=…&exceptNight=…
// — a TMDB proxy (so the API token stays server-side) whose results say when
// the group last watched each film. exceptNight, optional, is the Night whose
// film is being chosen: its own film doesn't count. 400 empty query or a bad
// id, 503 when TMDB is unconfigured, 502 on an upstream failure.
func searchMoviesHandler(store *db.Queries, client *tmdbClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" {
			writeJSONError(w, http.StatusBadRequest, "missing query")
			return
		}
		var except pgtype.UUID
		if raw := r.URL.Query().Get("exceptNight"); raw != "" {
			id, ok := parseUUID(w, raw, "invalid night id")
			if !ok {
				return
			}
			except = pgtype.UUID{Bytes: id, Valid: true}
		}
		if client == nil {
			writeJSONError(w, http.StatusServiceUnavailable, "movie search is not configured")
			return
		}
		results, err := client.SearchMovies(r.Context(), q)
		if err != nil {
			log.Printf("tmdb search %q: %v", q, err) //#nosec G706 -- q is a user query string logged with %q, not used as a format string
			writeJSONError(w, http.StatusBadGateway, "movie search failed")
			return
		}
		rows, err := store.GroupWatchedOn(r.Context(), db.GroupWatchedOnParams{
			GroupID:     gid,
			TmdbIds:     tmdbIDs(results),
			ExceptNight: except,
		})
		if err != nil {
			internalError(w, gid, "group watched on", err)
			return
		}
		watchedOn := make(map[int32]string, len(rows))
		for _, row := range rows {
			watchedOn[row.TmdbID] = formatDay(row.WatchedOn.Time)
		}
		respondJSON(w, http.StatusOK, toSearchResults(results, watchedOn))
	}
}

// recordNightMovieHandler serves POST /groups/{groupId}/nights/{nightId}/movie.
// The body carries only {tmdbId}; the backend re-fetches canonical title/year from
// TMDB (source of truth), then caches the movie and sets it on the night in one
// transaction (setFilm). Repeatable: attaching a different movie is the
// correction path, on a Watched Night too.
func recordNightMovieHandler(pool *pgxpool.Pool, client *tmdbClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := pathGroupNight(w, r)
		if !ok {
			return
		}
		req, ok := decodeJSON[movieRequest](w, r)
		if !ok {
			return
		}
		if err := validateMovieRequest(req); err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		store := db.New(pool)
		// Existence check only, so an unknown night 404s before we call TMDB;
		// setFilm locks the night for the write itself.
		if _, ok := loadNight(w, r, store, gid, nightID); !ok {
			return
		}
		if client == nil {
			writeJSONError(w, http.StatusServiceUnavailable, "movie attach is not configured")
			return
		}
		// Outside the transaction: no row lock is held across the TMDB call.
		movie, err := client.FetchMovie(r.Context(), req.TMDBID)
		if err != nil {
			if errors.Is(err, errMovieNotFound) {
				writeJSONError(w, http.StatusNotFound, "no such movie")
				return
			}
			log.Printf("tmdb fetch movie %d: %v", req.TMDBID, err) //#nosec G706 -- req.TMDBID is an int
			writeJSONError(w, http.StatusBadGateway, "movie lookup failed")
			return
		}
		err = withTx(r.Context(), pool, func(q *db.Queries) error {
			return setFilm(r.Context(), q, gid, nightID, movie)
		})
		if err != nil {
			writeNightError(w, gid, "set night movie", err)
			return
		}
		writeNight(w, r, store, gid, nightID, http.StatusOK)
	}
}

// clearNightMovieHandler serves DELETE /groups/{groupId}/nights/{nightId}/movie.
// Idempotent: clearing when no movie is attached still returns the night DTO
// with movie null. A Watched Night keeps its film (422).
func clearNightMovieHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := pathGroupNight(w, r)
		if !ok {
			return
		}
		err := withTx(r.Context(), pool, func(q *db.Queries) error {
			return clearFilm(r.Context(), q, gid, nightID)
		})
		if err != nil {
			writeNightError(w, gid, "clear night movie", err)
			return
		}
		writeNight(w, r, db.New(pool), gid, nightID, http.StatusOK)
	}
}
