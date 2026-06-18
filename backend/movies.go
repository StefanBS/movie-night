package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// This file holds the movie concern: the movie DTO, the row/param mappers
// between the movies table and TMDB, and the two movie endpoints (TMDB search
// proxy and attach-to-night). It sits next to tmdb.go; the night lifecycle in
// nights.go embeds a movieDTO in its response but otherwise stays separate.

// movieDTO is the JSON shape for an attached movie (and a search result).
// ReleaseYear is null when TMDB has no release date. int32 matches the movies
// table and TMDB's domain (ids/years fit in 32 bits); JSON renders it as a number.
type movieDTO struct {
	TMDBID      int32   `json:"tmdbId"`
	Title       string  `json:"title"`
	ReleaseYear *int32  `json:"releaseYear"`
	PosterURL   *string `json:"posterUrl"`
}

// releaseYearPtr renders a nullable release year as *int32 (nil → JSON null).
func releaseYearPtr(v pgtype.Int4) *int32 {
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

// movieDTOPtr maps a cached movie row to the DTO; nil renders "movie" as null.
func movieDTOPtr(m *db.Movie) *movieDTO {
	if m == nil {
		return nil
	}
	return &movieDTO{TMDBID: m.TmdbID, Title: m.Title, ReleaseYear: releaseYearPtr(m.ReleaseYear), PosterURL: posterURLPtr(m.PosterPath)}
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

// int4Ptr maps an optional release year to pgtype.Int4 for UpsertMovie.
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
		out = append(out, movieDTO{TMDBID: m.TMDBID, Title: m.Title, ReleaseYear: m.ReleaseYear, PosterURL: posterURL(m.PosterPath)})
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
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(toMovieResults(results)); err != nil {
			log.Printf("encode movie results: %v", err) //#nosec G706 -- only an error value, no user input
		}
	}
}

// recordNightMovieHandler serves POST /groups/{groupId}/nights/{nightId}/movie.
// The body carries only {tmdbId}; the backend re-fetches canonical title/year from
// TMDB (source of truth), caches the movie, and sets it on the night. Repeatable:
// attaching a different movie is the correction path. It reuses the night plumbing
// (ensureNight/writeNightDTO over nightStore) from nights.go.
func recordNightMovieHandler(store nightStore, client *tmdbClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}
		nightID, ok := pathUUID(w, r, "nightId", "invalid night id")
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
		if !ensureNight(w, r, store, gid, nightID) {
			return
		}
		if client == nil {
			writeJSONError(w, http.StatusServiceUnavailable, "movie attach is not configured")
			return
		}
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
		cached, err := store.UpsertMovie(r.Context(), db.UpsertMovieParams{
			TmdbID:      movie.TMDBID,
			Title:       movie.Title,
			ReleaseYear: int4Ptr(movie.ReleaseYear),
			PosterPath:  pgText(movie.PosterPath),
		})
		if err != nil {
			internalError(w, gid, "upsert movie", err)
			return
		}
		if _, err := store.SetNightMovie(r.Context(), db.SetNightMovieParams{
			MovieID: pgtype.UUID{Bytes: cached.ID, Valid: true},
			NightID: nightID,
			GroupID: gid,
		}); err != nil {
			internalError(w, gid, "set night movie", err)
			return
		}
		writeNightDTO(w, r, store, gid, nightID, http.StatusOK)
	}
}
