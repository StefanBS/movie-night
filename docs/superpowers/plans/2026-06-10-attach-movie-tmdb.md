# Attach a Movie (TMDB live search) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the group attach a real film to a night via live TMDB search — completing the core loop (whose turn → record the pick → what did they pick).

**Architecture:** The Go backend proxies TMDB (token server-side) and is the source of truth on attach: the client sends only a `tmdbId`, the backend re-fetches canonical title/year from TMDB, caches it in a new `movies` table, and sets `picks.movie_id`. The mobile app stays a pure client — a new "Tonight's movie" search/attach section on the night screen.

**Tech Stack:** Go (stdlib `net/http`, sqlc, pgx, goose), PostgreSQL, Expo / React Native (TypeScript), `node:test` via tsx.

Spec: [`docs/superpowers/specs/2026-06-10-attach-movie-tmdb-design.md`](../specs/2026-06-10-attach-movie-tmdb-design.md).

---

### Task 1: Schema + queries (movies table, picks.movie_id, sqlc regen)

**Goal:** A `movies` cache table and a nullable `picks.movie_id`, plus the three movie queries and `movie_id` threaded through the existing night queries — all reflected in regenerated sqlc code.

**Files:**
- Create: `backend/migrations/0005_movies.sql`
- Create: `backend/internal/db/query/movies.sql`
- Modify: `backend/internal/db/query/nights.sql` (add `movie_id` to 5 column lists)
- Regenerate (do not hand-edit): `backend/internal/db/*.sql.go`, `backend/internal/db/models.go`

**Acceptance Criteria:**
- [ ] `movies` table exists with a unique `tmdb_id`; `picks.movie_id` is a nullable FK with `ON DELETE RESTRICT`.
- [ ] sqlc generates `db.Movie`, `db.Pick.MovieID`, and `UpsertMovie`/`GetMovie`/`SetNightMovie` methods + params.
- [ ] The five night queries return `movie_id` so they keep mapping to `db.Pick`.

**Verify:** `cd backend && just sqlc && just build && just test` → builds, existing unit tests pass.

**Steps:**

- [ ] **Step 1: Write the migration**

Create `backend/migrations/0005_movies.sql`:

```sql
-- +goose Up
-- +goose StatementBegin
CREATE TABLE movies (
    id           uuid        PRIMARY KEY DEFAULT uuidv7(),
    tmdb_id      integer     NOT NULL UNIQUE,
    title        varchar     NOT NULL,
    release_year integer         NULL,
    cached_at    timestamptz NOT NULL DEFAULT now()
);
-- +goose StatementEnd

-- +goose StatementBegin
-- Nullable on purpose: a night (picks row) is planned first and the movie is
-- attached later. RESTRICT keeps a movie any night references (history survives).
ALTER TABLE picks
    ADD COLUMN movie_id uuid NULL REFERENCES movies(id) ON DELETE RESTRICT;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE picks DROP COLUMN IF EXISTS movie_id;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS movies;
-- +goose StatementEnd
```

- [ ] **Step 2: Write the movie queries**

Create `backend/internal/db/query/movies.sql`:

```sql
-- name: UpsertMovie :one
INSERT INTO movies (tmdb_id, title, release_year)
VALUES (sqlc.arg(tmdb_id), sqlc.arg(title), sqlc.arg(release_year))
ON CONFLICT (tmdb_id) DO UPDATE
    SET title = excluded.title, release_year = excluded.release_year, cached_at = now()
RETURNING id, tmdb_id, title, release_year, cached_at;

-- name: GetMovie :one
SELECT id, tmdb_id, title, release_year, cached_at
FROM movies
WHERE id = sqlc.arg(id);

-- name: SetNightMovie :one
UPDATE picks
SET movie_id = sqlc.arg(movie_id)
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id)
RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id;
```

> **Column order matters:** list `movie_id` **last** (after `created_at`), matching the physical table order that `ALTER TABLE … ADD COLUMN` produces. sqlc only reuses the shared `db.Pick` struct when a RETURNING/SELECT list matches the physical column order exactly; any other order makes it mint a divergent `*Row` type that breaks the `nightStore` interface. This applies here and to the five night queries below.

- [ ] **Step 3: Add `movie_id` to the five night queries**

In `backend/internal/db/query/nights.sql`, append `movie_id` to each SELECT/RETURNING column list so the rows keep matching the full `picks` table in **physical column order** (otherwise sqlc mints a divergent row type instead of `db.Pick` — see the column-order note above). The lists appear in `CreateNight`, `GetNight`, `GetCurrentNight`, `GetOpenNight`, `SetNightPicker`. Each currently ends `…, is_credited, scheduled_for, created_at`; change every one to `…, is_credited, scheduled_for, created_at, movie_id`. For example `GetNight` becomes:

```sql
-- name: GetNight :one
SELECT id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id
FROM picks
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id);
```

Apply the identical trailing `, movie_id` (after `created_at`) to the `RETURNING`/`SELECT` lists of `CreateNight`, `GetCurrentNight`, `GetOpenNight`, and `SetNightPicker`.

- [ ] **Step 4: Regenerate sqlc and build**

Run: `cd backend && just sqlc && just build`
Expected: builds clean. `internal/db/models.go` now has a `Movie` struct and `Pick.MovieID pgtype.UUID`; `internal/db/movies.sql.go` has `UpsertMovie`, `GetMovie`, `SetNightMovie` with `UpsertMovieParams{TmdbID int32; Title string; ReleaseYear pgtype.Int4}` and `SetNightMovieParams{MovieID pgtype.UUID; NightID uuid.UUID; GroupID uuid.UUID}`.

- [ ] **Step 5: Confirm existing tests still pass**

Run: `cd backend && just test`
Expected: PASS (adding the `MovieID` field to `db.Pick` is additive; no callers break).

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/0005_movies.sql backend/internal/db/query/movies.sql backend/internal/db/query/nights.sql backend/internal/db/
git commit -m "feat(db): movies table + nullable picks.movie_id + movie queries"
```

---

### Task 2: TMDB client + pure parse helpers

**Goal:** A small `tmdbClient` (injectable base URL, Bearer auth, timeout) with `SearchMovies`/`FetchMovie`, backed by pure, unit-tested parse helpers.

**Files:**
- Create: `backend/tmdb.go`
- Create: `backend/tmdb_test.go`

**Acceptance Criteria:**
- [ ] `parseTMDBSearch`, `parseTMDBMovie`, `releaseYear` are pure and unit-tested (incl. blank/malformed dates).
- [ ] `FetchMovie` maps an upstream 404 to a sentinel `errMovieNotFound`.
- [ ] `newTMDBClient("")` returns `nil` (TMDB disabled).

**Verify:** `cd backend && go test -run 'TestReleaseYear|TestParseTMDB' ./...` → PASS

**Steps:**

- [ ] **Step 1: Write the failing tests**

Create `backend/tmdb_test.go`:

```go
package main

import "testing"

func intp(n int) *int { return &n }

func TestReleaseYear(t *testing.T) {
	tests := []struct {
		in   string
		want *int
	}{
		{"2021-10-22", intp(2021)},
		{"1984-12-14", intp(1984)},
		{"", nil},
		{"nope", nil},
		{"20", nil},
	}
	for _, tt := range tests {
		got := releaseYear(tt.in)
		if (got == nil) != (tt.want == nil) {
			t.Fatalf("releaseYear(%q) = %v, want %v", tt.in, got, tt.want)
		}
		if got != nil && *got != *tt.want {
			t.Errorf("releaseYear(%q) = %d, want %d", tt.in, *got, *tt.want)
		}
	}
}

func TestParseTMDBSearch(t *testing.T) {
	body := []byte(`{"results":[
		{"id":438631,"title":"Dune","release_date":"2021-10-22"},
		{"id":841,"title":"Dune","release_date":"1984-12-14"},
		{"id":99,"title":"No Date","release_date":""}
	]}`)
	got, err := parseTMDBSearch(body)
	if err != nil {
		t.Fatalf("parseTMDBSearch: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("len = %d, want 3", len(got))
	}
	if got[0].TMDBID != 438631 || got[0].Title != "Dune" || got[0].ReleaseYear == nil || *got[0].ReleaseYear != 2021 {
		t.Errorf("[0] = %+v", got[0])
	}
	if got[2].ReleaseYear != nil {
		t.Errorf("[2] release year = %v, want nil", got[2].ReleaseYear)
	}
}

func TestParseTMDBMovie(t *testing.T) {
	got, err := parseTMDBMovie([]byte(`{"id":438631,"title":"Dune","release_date":"2021-10-22"}`))
	if err != nil {
		t.Fatalf("parseTMDBMovie: %v", err)
	}
	if got.TMDBID != 438631 || got.Title != "Dune" || got.ReleaseYear == nil || *got.ReleaseYear != 2021 {
		t.Errorf("got %+v", got)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test -run 'TestReleaseYear|TestParseTMDB' ./...`
Expected: FAIL — `undefined: releaseYear` / `parseTMDBSearch` / `parseTMDBMovie`.

- [ ] **Step 3: Write the client**

Create `backend/tmdb.go`:

```go
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
type movieResult struct {
	TMDBID      int
	Title       string
	ReleaseYear *int
}

// tmdbClient calls the TMDB REST API. baseURL is injectable so tests point it at
// a local httptest fake upstream (real HTTP, fake TMDB). A nil *tmdbClient means
// TMDB is unconfigured; handlers check for it and return 503.
type tmdbClient struct {
	baseURL string
	token   string // v4 Read Access Token, sent as a Bearer header
	http    *http.Client
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
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

// get issues an authenticated GET to path (+optional query) and returns the
// status code and body (capped at 1 MiB).
func (c *tmdbClient) get(ctx context.Context, path string, q url.Values) (int, []byte, error) {
	u := c.baseURL + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")
	res, err := c.http.Do(req)
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

// tmdbMovieJSON is the subset of a TMDB movie object we decode.
type tmdbMovieJSON struct {
	ID          int    `json:"id"`
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
// Returns nil for a blank or malformed date. Pure.
func releaseYear(s string) *int {
	if len(s) < 4 {
		return nil
	}
	y, err := strconv.Atoi(s[:4])
	if err != nil {
		return nil
	}
	return &y
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test -run 'TestReleaseYear|TestParseTMDB' ./...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/tmdb.go backend/tmdb_test.go
git commit -m "feat(tmdb): client + pure parse helpers for search/fetch"
```

---

### Task 3: Night DTO carries the attached movie (read path)

**Goal:** The night DTO renders a `movie` object (or `null`); `writeNightDTO` loads it when a night has a `movie_id`.

**Files:**
- Modify: `backend/nights.go` (DTO type, mappers, `writeNightDTO`, `nightStore`)
- Modify: `backend/nights_test.go` (update `toNightResponse` call sites; add movie-mapping test)

**Acceptance Criteria:**
- [ ] `nightResponse` has `Movie *movieDTO` rendering `null` when unset.
- [ ] `writeNightDTO` issues one `GetMovie` lookup only when `Pick.MovieID` is valid.
- [ ] `toNightResponse` maps a `*db.Movie` (incl. a null `release_year`) and existing tests pass.

**Verify:** `cd backend && go test -run 'TestToNightResponse' ./... && just build` → PASS

**Steps:**

- [ ] **Step 1: Update the failing test first**

In `backend/nights_test.go`:
- The `toNightResponse` calls in `TestToNightResponse` gain a trailing `nil` arg. Replace the three call sites:
  - `toNightResponse(mkPick(), rows)` → `toNightResponse(mkPick(), rows, nil)`
  - `toNightResponse(mkPick(), nil)` (both occurrences) → `toNightResponse(mkPick(), nil, nil)`
- Add this subtest inside `TestToNightResponse` (it references `db.Movie` and `pgtype` — both already imported):

```go
	t.Run("movie is null when unset and populated when set", func(t *testing.T) {
		none := toNightResponse(mkPick(), nil, nil)
		if none.Movie != nil {
			t.Errorf("Movie = %v, want nil", none.Movie)
		}
		m := db.Movie{TmdbID: 438631, Title: "Dune"}
		m.ReleaseYear = pgtype.Int4{Int32: 2021, Valid: true}
		got := toNightResponse(mkPick(), nil, &m)
		if got.Movie == nil || got.Movie.TMDBID != 438631 || got.Movie.Title != "Dune" ||
			got.Movie.ReleaseYear == nil || *got.Movie.ReleaseYear != 2021 {
			t.Errorf("Movie = %+v", got.Movie)
		}
		noYear := db.Movie{TmdbID: 841, Title: "Dune"} // ReleaseYear zero value → Valid false
		got2 := toNightResponse(mkPick(), nil, &noYear)
		if got2.Movie == nil || got2.Movie.ReleaseYear != nil {
			t.Errorf("Movie release year = %+v, want nil", got2.Movie)
		}
	})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && go test -run 'TestToNightResponse' ./...`
Expected: FAIL — `too many arguments in call to toNightResponse` / `night.Movie undefined`.

- [ ] **Step 3: Add the DTO type and mappers in `nights.go`**

Add the `movieDTO` type next to `nightResponse`, and add `Movie` to `nightResponse`:

```go
// movieDTO is the JSON shape for an attached movie (and a search result).
// ReleaseYear is null when TMDB has no release date.
type movieDTO struct {
	TMDBID      int    `json:"tmdbId"`
	Title       string `json:"title"`
	ReleaseYear *int   `json:"releaseYear"`
}
```

In `nightResponse`, add the field (place it after `PickerID`):

```go
	PickerID     *string    `json:"pickerId"`
	Movie        *movieDTO  `json:"movie"`
	Attendees    []attendee `json:"attendees"`
```

Add the two helper mappers (near `pickerIDPtr`):

```go
// releaseYearPtr renders a nullable release year as *int (nil → JSON null).
func releaseYearPtr(v pgtype.Int4) *int {
	if !v.Valid {
		return nil
	}
	y := int(v.Int32)
	return &y
}

// movieDTOPtr maps a cached movie row to the DTO; nil renders "movie" as null.
func movieDTOPtr(m *db.Movie) *movieDTO {
	if m == nil {
		return nil
	}
	return &movieDTO{TMDBID: int(m.TmdbID), Title: m.Title, ReleaseYear: releaseYearPtr(m.ReleaseYear)}
}
```

Change `toNightResponse` to accept and set the movie:

```go
func toNightResponse(p db.Pick, rows []db.ListNightAttendeesRow, movie *db.Movie) nightResponse {
	attendees := make([]attendee, 0, len(rows))
	for _, r := range rows {
		attendees = append(attendees, attendee{
			ID:   r.ID.String(),
			Name: r.Name,
			Role: string(r.Role),
		})
	}
	return nightResponse{
		ID:           p.ID.String(),
		ScheduledFor: p.ScheduledFor.Time.Format("2006-01-02"),
		PickerID:     pickerIDPtr(p.PickerID),
		Movie:        movieDTOPtr(movie),
		Attendees:    attendees,
	}
}
```

- [ ] **Step 4: Load the movie in `writeNightDTO` and extend `nightStore`**

Add `GetMovie` to the `nightStore` interface:

```go
	GetMovie(ctx context.Context, id uuid.UUID) (db.Movie, error)
```

In `writeNightDTO`, after the `GetNight` call and before the `ListNightAttendees` call, load the movie when present, then pass it to `toNightResponse`:

```go
	var movie *db.Movie
	if night.MovieID.Valid {
		m, err := store.GetMovie(r.Context(), uuid.UUID(night.MovieID.Bytes))
		if err != nil {
			internalError(w, gid, "get movie", err)
			return
		}
		movie = &m
	}
	rows, err := store.ListNightAttendees(r.Context(), db.ListNightAttendeesParams{GroupID: gid, NightID: nightID})
	if err != nil {
		internalError(w, gid, "list night attendees", err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(toNightResponse(night, rows, movie)); err != nil {
		log.Printf("encode night response (%s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID (canonical hex), not free-form input
	}
```

- [ ] **Step 5: Run tests and build**

Run: `cd backend && go test -run 'TestToNightResponse' ./... && just build`
Expected: PASS and clean build.

- [ ] **Step 6: Commit**

```bash
git add backend/nights.go backend/nights_test.go
git commit -m "feat(nights): night DTO carries the attached movie"
```

---

### Task 4: Search + attach handlers and wiring

**Goal:** `GET /movies/search` (TMDB proxy) and `POST /groups/{groupId}/nights/{nightId}/movie` (re-fetch canonical metadata, cache, set on night), wired in `main.go` with optional `TMDB_READ_TOKEN`.

**Files:**
- Modify: `backend/nights.go` (request type, validator, `searchMoviesHandler`, `recordNightMovieHandler`, `toMovieResults`, `int4Ptr`, `nightStore`)
- Modify: `backend/main.go` (read token, build client, register routes)
- Modify: `backend/.env.example` (document `TMDB_READ_TOKEN`)
- Modify: `backend/nights_test.go` (unit test for `validateMovieRequest`)

**Acceptance Criteria:**
- [ ] `GET /movies/search?q=` → 400 empty `q`, 503 unconfigured, 502 upstream error, else mapped JSON array.
- [ ] `POST .../movie` validates `tmdbId>0` (400), 404 unknown night, 503 unconfigured, 404 unknown movie, 502 other upstream error, else 200 night DTO with the movie.
- [ ] `validateMovieRequest` is unit-tested.

**Verify:** `cd backend && go test -run 'TestValidateMovieRequest' ./... && just build` → PASS

**Steps:**

- [ ] **Step 1: Write the failing unit test**

In `backend/nights_test.go`, add:

```go
func TestValidateMovieRequest(t *testing.T) {
	if err := validateMovieRequest(movieRequest{TMDBID: 438631}); err != nil {
		t.Errorf("valid tmdbId rejected: %v", err)
	}
	for _, bad := range []int{0, -1} {
		if err := validateMovieRequest(movieRequest{TMDBID: bad}); err == nil {
			t.Errorf("tmdbId %d accepted, want error", bad)
		}
	}
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && go test -run 'TestValidateMovieRequest' ./...`
Expected: FAIL — `undefined: validateMovieRequest` / `movieRequest`.

- [ ] **Step 3: Add the request type, validator, handlers, and store methods in `nights.go`**

Add `strings` to the import block (the rest — `encoding/json`, `errors`, `log`, `net/http`, `uuid`, `pgtype`, `db` — are already imported).

Add the movie request type and validator (near `recordPickRequest`):

```go
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
func int4Ptr(v *int) pgtype.Int4 {
	if v == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(*v), Valid: true}
}

// toMovieResults maps TMDB search hits to the JSON DTO (always non-nil → []).
func toMovieResults(results []movieResult) []movieDTO {
	out := make([]movieDTO, 0, len(results))
	for _, m := range results {
		out = append(out, movieDTO{TMDBID: m.TMDBID, Title: m.Title, ReleaseYear: m.ReleaseYear})
	}
	return out
}
```

(`fmt` is already imported in `nights.go`.)

Add `UpsertMovie` and `SetNightMovie` to the `nightStore` interface (it already has `GetMovie` from Task 3):

```go
	UpsertMovie(ctx context.Context, arg db.UpsertMovieParams) (db.Movie, error)
	SetNightMovie(ctx context.Context, arg db.SetNightMovieParams) (db.Pick, error)
```

Add the two handlers (at the end of `nights.go`):

```go
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
			log.Printf("tmdb search %q: %v", q, err)
			writeJSONError(w, http.StatusBadGateway, "movie search failed")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(toMovieResults(results)); err != nil {
			log.Printf("encode movie results: %v", err)
		}
	}
}

// recordNightMovieHandler serves POST /groups/{groupId}/nights/{nightId}/movie.
// The body carries only {tmdbId}; the backend re-fetches canonical title/year from
// TMDB (source of truth), caches the movie, and sets it on the night. Repeatable:
// attaching a different movie is the correction path.
func recordNightMovieHandler(store nightStore, client *tmdbClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := parseGroupAndNight(w, r)
		if !ok {
			return
		}
		var req movieRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
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
			log.Printf("tmdb fetch movie %d: %v", req.TMDBID, err)
			writeJSONError(w, http.StatusBadGateway, "movie lookup failed")
			return
		}
		cached, err := store.UpsertMovie(r.Context(), db.UpsertMovieParams{
			TmdbID:      int32(movie.TMDBID),
			Title:       movie.Title,
			ReleaseYear: int4Ptr(movie.ReleaseYear),
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
```

- [ ] **Step 4: Wire `main.go`**

After `queries := db.New(pool)`, build the TMDB client:

```go
	tmdb := newTMDBClient(os.Getenv("TMDB_READ_TOKEN"))
	if tmdb == nil {
		log.Print("TMDB not configured (TMDB_READ_TOKEN unset); /movies/search and attach return 503")
	} else {
		log.Print("TMDB configured")
	}
```

Register the routes alongside the other night routes:

```go
	mux.Handle("GET /movies/search", searchMoviesHandler(tmdb))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/movie", recordNightMovieHandler(queries, tmdb))
```

- [ ] **Step 5: Document the env var**

Append to `backend/.env.example`:

```
# TMDB v4 Read Access Token (themoviedb.org → Settings → API). Enables movie
# search/attach; unset → those endpoints return 503 and the rest of the app works.
TMDB_READ_TOKEN=
```

- [ ] **Step 6: Run the unit test and build**

Run: `cd backend && go test -run 'TestValidateMovieRequest' ./... && just check`
Expected: PASS, and `just check` (fmt + vet + build + unit tests) is green.

- [ ] **Step 7: Commit**

```bash
git add backend/nights.go backend/main.go backend/.env.example backend/nights_test.go
git commit -m "feat(api): /movies/search proxy + attach-movie endpoint"
```

---

### Task 5: Backend integration tests (fake TMDB upstream)

**Goal:** Exercise search + attach end to end against real Postgres (testcontainers) and a local fake TMDB server (real HTTP, fake upstream).

**Files:**
- Create: `backend/movies_integration_test.go`

**Acceptance Criteria:**
- [ ] Search returns mapped results; attach populates the night DTO `movie` and creates a `movies` row.
- [ ] Re-attach a different movie updates the DTO; the same `tmdbId` across two nights yields one `movies` row.
- [ ] Unknown `tmdbId` → 404; unconfigured client → 503; malformed body → 400; unknown night → 404.

**Verify:** `cd backend && go test -tags=integration -run 'TestMovieAttachIntegration' ./...` → PASS (needs the container runtime; see CLAUDE.md / `.env`).

**Steps:**

- [ ] **Step 1: Write the integration test**

Create `backend/movies_integration_test.go`:

```go
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
	client := &tmdbClient{baseURL: upstream.URL, token: "test", http: upstream.Client()}

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
```

Add `"bytes"` to the import block (used by `do` and the 503 case).

- [ ] **Step 2: Run the integration test**

Run: `cd backend && go test -tags=integration -run 'TestMovieAttachIntegration' ./...`
Expected: PASS. (If the container runtime isn't up, start it per CLAUDE.md — rootless Podman via `DOCKER_HOST` in `.env`.)

- [ ] **Step 3: Commit**

```bash
git add backend/movies_integration_test.go
git commit -m "test(api): integration for movie search + attach against fake TMDB"
```

---

### Task 6: Mobile movie client + night-model field

**Goal:** `lib/movies.ts` (Movie type, `parseMovie`, `searchMovies`) and `lib/nights.ts` gaining `movie` + `attachMovie`, with unit and integration tests.

**Files:**
- Create: `mobile/lib/movies.ts`
- Create: `mobile/lib/movies.test.ts`
- Create: `mobile/lib/movies.integration.test.ts`
- Modify: `mobile/lib/nights.ts` (Night `movie`, `parseNight`, `attachMovie`)
- Modify: `mobile/lib/nights.test.ts` (movie cases)
- Modify: `mobile/lib/nights.integration.test.ts` (add `movie: null` to the typed fixture)

**Acceptance Criteria:**
- [ ] `parseMovie` accepts a valid movie (incl. null/missing `releaseYear`) and rejects bad shapes.
- [ ] `searchMovies` hits `/movies/search?q=…`, parses an array, throws on non-2xx.
- [ ] `attachMovie` POSTs `{tmdbId}` to `.../movie` and parses the returned Night.
- [ ] `parseNight` reads `movie` (object or null/absent) and rejects a bad movie shape.

**Verify:** `cd mobile && just check` → lint, typecheck, and tests pass.

> **Note (module boundary):** `attachMovie` lives in `lib/nights.ts`, not `lib/movies.ts` — it returns a `Night` and reuses the `fetchNight` helper, and putting it in `movies.ts` would create an import cycle (`movies` ↔ `nights`). `movies.ts` stays dependency-free of `nights.ts`.

**Steps:**

- [ ] **Step 1: Write `lib/movies.ts`**

Create `mobile/lib/movies.ts`:

```ts
export type Movie = {
  tmdbId: number;
  title: string;
  releaseYear: number | null;
};

// parseMovie validates an untrusted movie object (a search result or a night's
// attached movie) and returns a typed Movie, throwing on a bad shape.
export function parseMovie(raw: unknown): Movie {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("expected a movie object");
  }
  const { tmdbId, title, releaseYear } = raw as Record<string, unknown>;
  if (typeof tmdbId !== "number") {
    throw new Error("movie: tmdbId must be a number");
  }
  if (typeof title !== "string") {
    throw new Error("movie: title must be a string");
  }
  if (releaseYear !== undefined && releaseYear !== null && typeof releaseYear !== "number") {
    throw new Error("movie: releaseYear must be a number or null");
  }
  return { tmdbId, title, releaseYear: releaseYear ?? null };
}

// searchMovies proxies TMDB search through the backend and returns typed results.
export async function searchMovies(
  baseUrl: string,
  query: string,
  signal?: AbortSignal,
): Promise<Movie[]> {
  const res = await fetch(`${baseUrl}/movies/search?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("movies: expected an array");
  }
  return data.map(parseMovie);
}
```

- [ ] **Step 2: Write `lib/movies.test.ts`**

Create `mobile/lib/movies.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { parseMovie, searchMovies } from "./movies";

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

async function startServer(handler: Handler): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr === null || typeof addr === "string") {
    throw new Error("server has no port");
  }
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

test("parseMovie accepts a valid movie", () => {
  const m = parseMovie({ tmdbId: 438631, title: "Dune", releaseYear: 2021 });
  assert.deepEqual(m, { tmdbId: 438631, title: "Dune", releaseYear: 2021 });
});

test("parseMovie treats null and missing releaseYear as null", () => {
  assert.equal(parseMovie({ tmdbId: 1, title: "X", releaseYear: null }).releaseYear, null);
  assert.equal(parseMovie({ tmdbId: 1, title: "X" }).releaseYear, null);
});

test("parseMovie rejects bad shapes", () => {
  assert.throws(() => parseMovie(null), /movie object/);
  assert.throws(() => parseMovie({ tmdbId: "x", title: "X" }), /tmdbId/);
  assert.throws(() => parseMovie({ tmdbId: 1, title: 2 }), /title/);
  assert.throws(() => parseMovie({ tmdbId: 1, title: "X", releaseYear: "2021" }), /releaseYear/);
});

test("searchMovies hits the search path with the query and parses results", async () => {
  let path = "";
  const server = await startServer((req, res) => {
    path = req.url ?? "";
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ tmdbId: 438631, title: "Dune", releaseYear: 2021 }]));
  });
  try {
    const got = await searchMovies(server.url, "dune two");
    assert.equal(path, "/movies/search?q=dune%20two");
    assert.equal(got.length, 1);
    assert.equal(got[0].title, "Dune");
  } finally {
    await server.close();
  }
});

test("searchMovies throws on a non-2xx response", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 503;
    res.end("nope");
  });
  try {
    await assert.rejects(searchMovies(server.url, "dune"), /request failed: 503/);
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 3: Run the movie tests to verify they pass**

Run: `cd mobile && node --import tsx --test lib/movies.test.ts`
Expected: PASS.

- [ ] **Step 4: Extend `lib/nights.ts`**

At the top, import from `./movies`:

```ts
import { parseMovie, type Movie } from "./movies";
```

Add `movie` to the `Night` type (after `pickerId`):

```ts
export type Night = {
  id: string;
  scheduledFor: string;
  pickerId: string | null;
  movie: Movie | null;
  attendees: Attendee[];
};
```

In `parseNight`, destructure and validate `movie`, then include it in the return. Replace the destructure line and the return statement:

```ts
  const { id, scheduledFor, pickerId, movie, attendees } = raw as Record<string, unknown>;
```

…and the final return:

```ts
  const parsedMovie = movie === undefined || movie === null ? null : parseMovie(movie);
  return {
    id,
    scheduledFor,
    pickerId: pickerId ?? null,
    movie: parsedMovie,
    attendees: attendees.map(parseAttendee),
  };
```

Add `attachMovie` next to `recordNightPick`:

```ts
// attachMovie sets (or changes) the night's movie. The client sends only the
// tmdbId; the backend re-fetches canonical metadata from TMDB.
export function attachMovie(
  baseUrl: string,
  groupId: string,
  nightId: string,
  tmdbId: number,
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(`${baseUrl}/groups/${groupId}/nights/${nightId}/movie`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tmdbId }),
    signal,
  });
}
```

- [ ] **Step 5: Update night tests for the `movie` field**

In `mobile/lib/nights.integration.test.ts`, add `attachMovie` to the import list and `movie: null` to the typed `night` fixture:

```ts
import {
  createNight,
  addAttendee,
  removeAttendee,
  getNightTurn,
  getNight,
  getCurrentNight,
  recordNightPick,
  attachMovie,
  type Night,
} from "./nights";
```

```ts
const night: Night = {
  id: NIGHT,
  scheduledFor: "2026-06-12",
  pickerId: null,
  movie: null,
  attendees: [{ id: ADA, name: "Ada", role: "core" }],
};
```

Append an `attachMovie` integration case to the same file:

```ts
test("attachMovie posts the tmdbId and parses the night with its movie", async () => {
  const withMovie: Night = { ...night, movie: { tmdbId: 438631, title: "Dune", releaseYear: 2021 } };
  let path = "";
  let method = "";
  let body = "";
  const server = await startServer(async (req, res) => {
    path = req.url ?? "";
    method = req.method ?? "";
    body = await collect(req);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(withMovie));
  });
  try {
    const got = await attachMovie(server.url, GROUP, NIGHT, 438631);
    assert.equal(method, "POST");
    assert.equal(path, `/groups/${GROUP}/nights/${NIGHT}/movie`);
    assert.deepEqual(JSON.parse(body), { tmdbId: 438631 });
    assert.deepEqual(got.movie, { tmdbId: 438631, title: "Dune", releaseYear: 2021 });
  } finally {
    await server.close();
  }
});
```

In `mobile/lib/nights.test.ts`, append movie-parsing cases:

```ts
test("parseNight reads an attached movie", () => {
  const n = parseNight({
    ...valid,
    movie: { tmdbId: 438631, title: "Dune", releaseYear: 2021 },
  });
  assert.deepEqual(n.movie, { tmdbId: 438631, title: "Dune", releaseYear: 2021 });
});

test("parseNight accepts a null or absent movie", () => {
  assert.equal(parseNight({ ...valid, movie: null }).movie, null);
  assert.equal(parseNight(valid).movie, null);
});

test("parseNight rejects a bad movie shape", () => {
  assert.throws(() => parseNight({ ...valid, movie: { tmdbId: "x", title: "Dune" } }), /tmdbId/);
});
```

- [ ] **Step 6: Run the full mobile check**

Run: `cd mobile && just check`
Expected: lint clean, typecheck clean, all tests (incl. the new movie + night cases) PASS.

- [ ] **Step 7: Commit**

```bash
git add mobile/lib/movies.ts mobile/lib/movies.test.ts mobile/lib/movies.integration.test.ts mobile/lib/nights.ts mobile/lib/nights.test.ts mobile/lib/nights.integration.test.ts
git commit -m "feat(mobile): movie search/attach client + night.movie field"
```

---

### Task 7: Mobile night screen — "Tonight's movie" section

**Goal:** A search-and-attach UI block on the night screen: search by title, tap a result to attach, see the attached `Title (Year)` with a "Change movie" affordance.

**Files:**
- Modify: `mobile/app/night.tsx`

**Acceptance Criteria:**
- [ ] When a night exists and has no movie, a search box + results list let the user attach a movie.
- [ ] When a movie is attached, the screen shows `Title (Year)` (or just the title when year is null) and a "Change movie" button that reopens search; tapping a new result swaps it.
- [ ] Attaching takes the existing one-op `busy` lock and surfaces failures in the error banner; searching (a read) runs while idle without taking the lock.

**Verify:** `cd mobile && just typecheck && just lint` → clean. Manual: `just start`, open the night, search "dune", tap a result, confirm it shows and persists across `getCurrentNight` reload.

> Read the Expo SDK 54 docs before editing native/Expo code (see `mobile/AGENTS.md`). This task uses only `react-native` primitives already used on the screen (`TextInput` is the one addition).

**Steps:**

- [ ] **Step 1: Import the movie client, the `Movie` type, and `TextInput`**

In `mobile/app/night.tsx`, add `TextInput` to the `react-native` import, add `attachMovie` to the `../lib/nights` import, and import the movies module:

```ts
import {
  ActivityIndicator,
  Button,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
```

```ts
import {
  addAttendee,
  attachMovie,
  createNight,
  getCurrentNight,
  getNightTurn,
  recordNightPick,
  removeAttendee,
  type Night,
} from "../lib/nights";
import { searchMovies, type Movie } from "../lib/movies";
```

- [ ] **Step 2: Add movie state and handlers (inside `NightScreen`, after the existing `useState` hooks)**

```tsx
  const [movieQuery, setMovieQuery] = useState("");
  const [results, setResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Show the search UI when no movie is attached yet, or when the user taps
  // "Change movie" on a night that already has one.
  const [changingMovie, setChangingMovie] = useState(false);

  const onSearch = useCallback(async () => {
    const q = movieQuery.trim();
    if (q === "") {
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await searchMovies(API_URL, q));
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "search failed");
    } finally {
      setSearching(false);
    }
  }, [movieQuery]);

  const onAttach = useCallback(
    async (tmdbId: number) => {
      if (night === null || busy !== null) {
        return;
      }
      setBusy("movie");
      setActionError(null);
      try {
        const updated = await attachMovie(API_URL, GROUP_ID, night.id, tmdbId);
        setNight(updated);
        setResults([]);
        setMovieQuery("");
        setChangingMovie(false);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "failed to attach movie");
      } finally {
        setBusy(null);
      }
    },
    [night, busy],
  );
```

- [ ] **Step 3: Render the "Tonight's movie" block**

Place this block immediately after the `Night of …` heading/hint/`actionError` lines and before the `Who's here?` section (i.e. just before `<Text style={styles.section}>{"Who's here?"}</Text>`):

```tsx
          <Text style={styles.section}>{"Tonight's movie"}</Text>
          {night.movie !== null && !changingMovie ? (
            <View style={styles.movieRow}>
              <Text style={styles.name}>
                {night.movie.releaseYear !== null
                  ? `${night.movie.title} (${night.movie.releaseYear})`
                  : night.movie.title}
              </Text>
              <Button title="Change movie" onPress={() => setChangingMovie(true)} disabled={busy !== null} />
            </View>
          ) : (
            <View>
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Search a film title…"
                  value={movieQuery}
                  onChangeText={setMovieQuery}
                  onSubmitEditing={onSearch}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                <Button title="Search" onPress={onSearch} disabled={searching || movieQuery.trim() === ""} />
              </View>
              {searchError !== null && <Text style={[styles.hint, styles.error]}>{searchError}</Text>}
              {results.map((m) => (
                <Pressable
                  key={m.tmdbId}
                  onPress={() => onAttach(m.tmdbId)}
                  disabled={busy !== null}
                  style={({ pressed }) => [styles.orderRow, pressed && styles.rowPressed]}
                >
                  <Text style={styles.name}>
                    {m.releaseYear !== null ? `${m.title} (${m.releaseYear})` : m.title}
                  </Text>
                  {busy === "movie" ? <Text style={styles.tag}>…</Text> : null}
                </Pressable>
              ))}
            </View>
          )}
```

- [ ] **Step 4: Add the styles**

In the `StyleSheet.create({ … })` block, add:

```ts
  movieRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
```

- [ ] **Step 5: Typecheck and lint**

Run: `cd mobile && just typecheck && just lint`
Expected: clean.

- [ ] **Step 6: Manual smoke test**

Run: `cd mobile && just start` (backend running with `TMDB_READ_TOKEN` set). Open the night, start a night if needed, search "dune", tap a result; confirm it shows as `Dune (2021)`, then reload and confirm `getCurrentNight` resumes it. Tap "Change movie" and swap to a different result.

- [ ] **Step 7: Commit**

```bash
git add mobile/app/night.tsx
git commit -m "feat(mobile): Tonight's movie search/attach on the night screen"
```

---

### Task 8: Docs — ADR-0007, schema.dbml, ADR index

**Goal:** Record the proxy + source-of-truth decisions as ADR-0007, fix the `movie_id` nullability note in the schema, and list the ADR in the index.

**Files:**
- Create: `docs/adr/0007-tmdb-proxy-source-of-truth.md`
- Modify: `docs/adr/README.md` (index entry + `Last updated`)
- Modify: `docs/schema.dbml` (`picks.movie_id` nullable)

**Acceptance Criteria:**
- [ ] ADR-0007 captures: backend proxies TMDB (token server-side, attribution centralized, mobile pure client) and attach re-fetches canonical metadata (`movies` is a cache keyed by `tmdb_id`).
- [ ] `docs/schema.dbml` shows `picks.movie_id` as nullable with a "plan-first" note.
- [ ] The ADR index lists ADR-0007 as Accepted.

**Verify:** Links resolve and the index renders. (No code; nothing to run.)

**Steps:**

- [ ] **Step 1: Write ADR-0007**

Create `docs/adr/0007-tmdb-proxy-source-of-truth.md`:

```markdown
# ADR-0007 — Proxy TMDB through the backend; the server is the source of truth on attach

**Status:** Accepted (2026-06-10)

## Context
Attaching a movie to a night uses TMDB (ADR-0002). TMDB needs an API token and
requires attribution. The mobile app is a pure client (ADR-0002), and we want one
place that holds the token and one trusted shape for stored movie metadata.

## Decision
- The Go backend **proxies TMDB**: `GET /movies/search` performs the search
  server-side so the token (a v4 Read Access Token in `TMDB_READ_TOKEN`) never
  ships to the client, and attribution lives in one place. The phone never calls
  TMDB directly.
- On attach (`POST /groups/{gid}/nights/{nightId}/movie`), the client sends only a
  `tmdbId`. The backend **re-fetches canonical title/year from TMDB** `/movie/{id}`
  and is the source of truth; client-supplied metadata is never trusted for the
  stored record.
- `movies` is a **cache keyed by `tmdb_id`** (upsert refreshes title/year). A
  night references a cached movie via the nullable `picks.movie_id` (planned
  first, attached later).
- TMDB is **optional config**: with no token, search and attach return `503` and
  the rest of the app is unaffected.

## Consequences
- One trusted metadata shape; no client tampering with stored titles/years.
- The attach path depends on TMDB reachability (a deliberate trade for authority);
  failures surface as `502`, an unknown id as `404`.
- A second TMDB round-trip on attach (search already returned the data), accepted
  for correctness. Posters and watch-provider availability remain deferred
  (see [backlog.md](backlog.md)).

---
[← Index](README.md)
```

- [ ] **Step 2: Add the index entry and bump `Last updated`**

In `docs/adr/README.md`, add under the Index list after the ADR-0006 line:

```markdown
- [ADR-0007](0007-tmdb-proxy-source-of-truth.md) — Proxy TMDB through the backend; the server is the source of truth on attach · *Accepted*
```

And change the `**Last updated:**` line to `2026-06-10`.

- [ ] **Step 3: Fix `movie_id` nullability in `docs/schema.dbml`**

In `docs/schema.dbml`, change the `picks.movie_id` column from:

```
  movie_id      uuid         [not null]
```

to:

```
  movie_id      uuid         [null, note: 'Attached after planning; NULL on a planned night with no movie yet (set via POST .../nights/{id}/movie)']
```

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0007-tmdb-proxy-source-of-truth.md docs/adr/README.md docs/schema.dbml
git commit -m "docs(adr): ADR-0007 TMDB proxy + source-of-truth; schema movie_id nullable"
```

---

## Task dependencies

- Task 1 → blocks Tasks 2, 3, 4, 5 (schema/generated code underpins them).
- Task 2 → blocks Tasks 4, 5 (handlers/integration use the client).
- Task 3 → blocks Task 4 (handler reuses the DTO mapping + extended `nightStore`).
- Task 4 → blocks Task 5 (integration drives the handlers).
- Task 6 → blocks Task 7 (screen uses `searchMovies`/`attachMovie`/`Night.movie`).
- Task 8 (docs) is independent — do it any time.

## Final verification

```bash
cd backend && just check && just test-integration
cd ../mobile && just check
```
Expected: backend fmt/vet/build/unit + integration all green; mobile lint/typecheck/tests green.
