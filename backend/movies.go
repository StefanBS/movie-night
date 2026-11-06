package main

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// This file holds the movie concern: the movie DTO, the row/param mappers
// between the movies table and TMDB, and the movie endpoints (TMDB search
// proxy, and attaching and clearing a night's film, whose writes run in
// night_writes.go). It sits next to tmdb.go; the night lifecycle in
// nights.go embeds a movieDTO in its response but otherwise stays separate.

// movieDTO is the JSON shape for an attached movie (and a search result).
// ReleaseYear is null when TMDB has no release date. int32 matches the movies
// table and TMDB's domain (ids/years fit in 32 bits); JSON renders it as a number.
// Genres is always an array (never null); RuntimeMinutes is null when unknown.
// Search results carry neither, so they return [] and null.
type movieDTO struct {
	TMDBID         int32    `json:"tmdbId"`
	Title          string   `json:"title"`
	ReleaseYear    *int32   `json:"releaseYear"`
	PosterURL      *string  `json:"posterUrl"`
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

// posterURLPtr builds the poster URL for a cached movie row, nil when NULL.
func posterURLPtr(p pgtype.Text) *string {
	if !p.Valid {
		return nil
	}
	return posterURL(p.String)
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

// pgText maps a raw string to pgtype.Text for UpsertMovie; "" stores as NULL.
func pgText(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}

// toMovieResults maps TMDB search hits to the JSON DTO (always non-nil → []).
func toMovieResults(results []movieResult) []movieDTO {
	out := make([]movieDTO, 0, len(results))
	for _, m := range results {
		out = append(out, movieDTO{
			TMDBID:         m.TMDBID,
			Title:          m.Title,
			ReleaseYear:    m.ReleaseYear,
			PosterURL:      posterURL(m.PosterPath),
			Genres:         genresOrEmpty(m.Genres),
			RuntimeMinutes: m.RuntimeMinutes,
		})
	}
	return out
}

// searchMoviesHandler serves GET /movies/search?q=… — a thin TMDB proxy so the
// API token stays server-side. 400 empty query, 503 when TMDB is unconfigured,
// 502 on an upstream failure.
func searchMoviesHandler(client *tmdbClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" {
			writeJSONError(w, http.StatusBadRequest, "missing query")
			return
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
		// uuid.Nil: this route is not group-scoped (see logScope).
		respondJSON(w, http.StatusOK, toMovieResults(results), uuid.Nil, "encode movie results")
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
