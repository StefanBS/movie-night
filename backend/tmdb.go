package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// errMovieNotFound is returned by FetchMovie when TMDB has no movie with the
// given id (an upstream 404), so the attach handler can map it to a 404.
var errMovieNotFound = errors.New("tmdb: movie not found")

// movieResult is the trimmed TMDB movie shape this app cares about: title + year.
// TMDBID/ReleaseYear are int32 to match the movies table columns (Postgres
// integer), so they cross the DB boundary without a narrowing conversion; an
// out-of-range value from TMDB is rejected at decode/parse time instead.
type movieResult struct {
	TMDBID      int32
	Title       string
	ReleaseYear *int32
}

// tmdbClient calls the TMDB REST API. baseURL is injectable so tests point it at
// a local httptest fake upstream (real HTTP, fake TMDB). A nil *tmdbClient means
// TMDB is unconfigured; handlers check for it and return 503.
type tmdbClient struct {
	baseURL string
	token   string // v4 Read Access Token, sent as a Bearer header
	client  *http.Client
}

// newTMDBClient builds a client for the real API, or returns nil when token is
// empty (TMDB disabled — search/attach then return 503).
func newTMDBClient(token string) *tmdbClient {
	if token == "" {
		return nil
	}
	return &tmdbClient{
		baseURL: "https://api.themoviedb.org/3",
		token:   token,
		client:  &http.Client{Timeout: 10 * time.Second},
	}
}

// get issues an authenticated GET to path (+optional query) and returns the
// status code and body (capped at 1 MiB).
//
// gosec flags the request below as G704 (SSRF): its taint analysis sees the
// search query reach the URL. This is a false positive — the scheme/host/path
// come entirely from the constant baseURL plus fixed per-endpoint paths; user
// input only ever enters as url.Values-encoded query parameters, so the request
// destination cannot be redirected. CodeQL's dataflow analysis agrees (no alert).
func (c *tmdbClient) get(ctx context.Context, path string, q url.Values) (int, []byte, error) {
	u := c.baseURL + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil) //#nosec G704 -- destination is the constant baseURL; user input is confined to url-encoded query params
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")
	res, err := c.client.Do(req) //#nosec G704 -- see above: request destination is not user-controlled
	if err != nil {
		return 0, nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return 0, nil, err
	}
	return res.StatusCode, body, nil
}

// SearchMovies returns TMDB search hits for a free-text query.
func (c *tmdbClient) SearchMovies(ctx context.Context, query string) ([]movieResult, error) {
	q := url.Values{}
	q.Set("query", query)
	q.Set("include_adult", "false")
	code, body, err := c.get(ctx, "/search/movie", q)
	if err != nil {
		return nil, err
	}
	if code != http.StatusOK {
		return nil, fmt.Errorf("tmdb search: status %d", code)
	}
	return parseTMDBSearch(body)
}

// FetchMovie returns one movie's canonical metadata, or errMovieNotFound on 404.
func (c *tmdbClient) FetchMovie(ctx context.Context, tmdbID int) (movieResult, error) {
	code, body, err := c.get(ctx, "/movie/"+strconv.Itoa(tmdbID), nil)
	if err != nil {
		return movieResult{}, err
	}
	if code == http.StatusNotFound {
		return movieResult{}, errMovieNotFound
	}
	if code != http.StatusOK {
		return movieResult{}, fmt.Errorf("tmdb movie: status %d", code)
	}
	return parseTMDBMovie(body)
}

// tmdbMovieJSON is the subset of a TMDB movie object we decode. ID is int32 so
// encoding/json rejects an out-of-range id at decode time (matching the DB type).
type tmdbMovieJSON struct {
	ID          int32  `json:"id"`
	Title       string `json:"title"`
	ReleaseDate string `json:"release_date"`
}

// parseTMDBSearch decodes a /search/movie body into movieResults. Pure.
func parseTMDBSearch(body []byte) ([]movieResult, error) {
	var payload struct {
		Results []tmdbMovieJSON `json:"results"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("decode tmdb search: %w", err)
	}
	out := make([]movieResult, 0, len(payload.Results))
	for _, m := range payload.Results {
		out = append(out, movieResult{TMDBID: m.ID, Title: m.Title, ReleaseYear: releaseYear(m.ReleaseDate)})
	}
	return out, nil
}

// parseTMDBMovie decodes a /movie/{id} body into one movieResult. Pure.
func parseTMDBMovie(body []byte) (movieResult, error) {
	var m tmdbMovieJSON
	if err := json.Unmarshal(body, &m); err != nil {
		return movieResult{}, fmt.Errorf("decode tmdb movie: %w", err)
	}
	return movieResult{TMDBID: m.ID, Title: m.Title, ReleaseYear: releaseYear(m.ReleaseDate)}, nil
}

// releaseYear extracts the leading year from a TMDB release_date ("YYYY-MM-DD").
// Returns nil for a blank or malformed date. ParseInt with bitSize 32 bounds the
// result to int32, so the conversion is safe by construction. Pure.
func releaseYear(s string) *int32 {
	if len(s) < 4 {
		return nil
	}
	y, err := strconv.ParseInt(s[:4], 10, 32)
	if err != nil {
		return nil
	}
	y32 := int32(y)
	return &y32
}
