# Movie Posters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a TMDB poster thumbnail next to each movie in search results and on the attached "Tonight's movie".

**Architecture:** Purely additive. The backend stores the raw TMDB `poster_path` and builds a full image URL (fixed `w342` size) in one pure helper that both `movieDTO` mappers (search + night) call. The mobile app renders the ready-made `posterUrl` as an `<Image>`, with a plain placeholder box when it is null. No new endpoints, routes, or status codes.

**Tech Stack:** Go 1.26 (stdlib net/http, sqlc, goose, testcontainers), Expo SDK 54 / React Native (built-in `Image`), node:test via tsx.

**User decisions (already made):**
- Backend builds the full poster URL from a hardcoded base+size; not a `/configuration` fetch. "Approach 1 seems reasonable."
- Store the raw `poster_path` in the DB, not a built URL (size is a render-time concern).
- Fixed size `w342` (comfortable for retina/web thumbnails).
- No-poster placeholder is a "plainbox"; thumbnail is the "same small size for both" search rows and the attached movie.
- Poster is nullable end-to-end (TMDB often has none).

**Spec:** `docs/superpowers/specs/2026-06-13-movie-posters-design.md`

**Implementation note (refines the spec's illustrative types):** model `poster_path` as a plain Go `string` through the TMDB client (empty string = no poster), so only two tiny helpers are needed — `posterURL(path string) *string` and `pgText(s string) pgtype.Text`. Behaviour is identical to the spec (DB stores NULL for no poster; DTO emits `null`).

---

### Task 1: Schema migration + movies queries + sqlc

**Goal:** Add the nullable `poster_path` column to `movies`, thread it through the `UpsertMovie`/`GetMovie` queries, and regenerate sqlc so `db.Movie` and `UpsertMovieParams` carry it.

**Files:**
- Create: `backend/migrations/0006_movie_poster.sql`
- Modify: `backend/internal/db/query/movies.sql`
- Modify (regenerated, do not hand-edit): `backend/internal/db/models.go`, `backend/internal/db/movies.sql.go`
- Modify: `docs/schema.dbml`

**Acceptance Criteria:**
- [ ] `just migrate` applies `0006` and `goose ... down` reverts it cleanly.
- [ ] After `just sqlc`, `db.Movie` has `PosterPath pgtype.Text` and `db.UpsertMovieParams` has `PosterPath pgtype.Text`.
- [ ] `just check` passes (build still green; the handler not yet setting `PosterPath` is fine — it defaults to NULL).
- [ ] `docs/schema.dbml` documents `movies.poster_path` as nullable.

**Verify:** `cd backend && just sqlc && just check` → builds clean; `grep -n "PosterPath" internal/db/models.go` shows the field.

**Steps:**

- [ ] **Step 1: Write the migration**

Create `backend/migrations/0006_movie_poster.sql` (goose `StatementBegin/End` wrappers, matching `0005`):

```sql
-- +goose Up
-- +goose StatementBegin
-- Raw TMDB poster_path (e.g. "/abc.jpg"); nullable because TMDB often has none.
-- The full image URL is built at DTO-render time, so size is not stored here.
ALTER TABLE movies ADD COLUMN poster_path varchar NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE movies DROP COLUMN IF EXISTS poster_path;
-- +goose StatementEnd
```

- [ ] **Step 2: Update the queries**

Edit `backend/internal/db/query/movies.sql` — add `poster_path` **last** (matching the table's physical column order, since `ALTER ... ADD COLUMN` appends it after `cached_at`):

```sql
-- name: UpsertMovie :one
INSERT INTO movies (tmdb_id, title, release_year, poster_path)
VALUES (sqlc.arg(tmdb_id), sqlc.arg(title), sqlc.arg(release_year), sqlc.arg(poster_path))
ON CONFLICT (tmdb_id) DO UPDATE
    SET title = excluded.title, release_year = excluded.release_year,
        poster_path = excluded.poster_path, cached_at = now()
RETURNING id, tmdb_id, title, release_year, cached_at, poster_path;

-- name: GetMovie :one
SELECT id, tmdb_id, title, release_year, cached_at, poster_path
FROM movies
WHERE id = sqlc.arg(id);

-- name: SetNightMovie :one
UPDATE picks
SET movie_id = sqlc.arg(movie_id)
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id)
RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id;
```

(`SetNightMovie` is unchanged — shown for context; do not alter it.)

- [ ] **Step 3: Regenerate sqlc and apply the migration**

Run: `cd backend && just sqlc && just db-up && just migrate`
Expected: `internal/db/models.go` `Movie` struct gains `PosterPath pgtype.Text`; `movies.sql.go` `UpsertMovieParams` gains `PosterPath pgtype.Text` and both query column lists include `poster_path`. Migration applies without error.

- [ ] **Step 4: Verify the rollback**

Run: `cd backend && set -a && . ./.env && set +a && goose -dir migrations postgres "$DATABASE_URL" down && just migrate`
Expected: down drops the column, re-up re-adds it, no errors. (Confirms the Down block is correct.)

- [ ] **Step 5: Update the schema doc**

In `docs/schema.dbml`, find the `movies` table and add the column with a note. Example shape (match the file's existing column/note style):

```
Table movies {
  id uuid [pk]
  tmdb_id integer [not null, unique]
  title varchar [not null]
  release_year integer [null]
  poster_path varchar [null, note: 'raw TMDB poster path; full image URL built at render time']
  cached_at timestamptz [not null]
}
```

- [ ] **Step 6: Build and commit**

Run: `cd backend && just check`
Expected: PASS (gofmt + vet + build + unit tests).

```bash
git add backend/migrations/0006_movie_poster.sql backend/internal/db/query/movies.sql backend/internal/db/models.go backend/internal/db/movies.sql.go docs/schema.dbml
git commit -m "feat: add nullable movies.poster_path (migration + sqlc)"
```

---

### Task 2: TMDB client carries poster_path + posterURL helper

**Goal:** Decode `poster_path` from TMDB into `movieResult`, and add the pure `posterURL` helper that builds the fixed-size image URL.

**Files:**
- Modify: `backend/tmdb.go`
- Test: `backend/tmdb_test.go`

**Acceptance Criteria:**
- [ ] `movieResult` and `tmdbMovieJSON` carry the poster path; `parseTMDBSearch`/`parseTMDBMovie` map it.
- [ ] `posterURL("/abc.jpg")` → `"https://image.tmdb.org/t/p/w342/abc.jpg"`; `posterURL("")` → `nil`.
- [ ] New/extended unit tests pass.

**Verify:** `cd backend && go test -run 'TestPosterURL|TestParseTMDBSearch|TestParseTMDBMovie' ./...` → PASS.

**Steps:**

- [ ] **Step 1: Write the failing tests**

In `backend/tmdb_test.go`, add a `*string` helper and a `posterURL` test, and extend the parse tests to assert the poster path. Add near the top (next to `intp`):

```go
func strp(s string) *string { return &s }

func TestPosterURL(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want *string
	}{
		{name: "path builds a full w342 url", in: "/abc.jpg", want: strp("https://image.tmdb.org/t/p/w342/abc.jpg")},
		{name: "empty string returns nil", in: "", want: nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := posterURL(tt.in)
			if (got == nil) != (tt.want == nil) {
				t.Fatalf("posterURL(%q) = %v, want %v", tt.in, got, tt.want)
			}
			if got != nil && *got != *tt.want {
				t.Errorf("posterURL(%q) = %q, want %q", tt.in, *got, *tt.want)
			}
		})
	}
}
```

In the existing `TestParseTMDBSearch` "valid body" subtest, add `poster_path` to the JSON and assert it. Replace the body literal and add assertions:

```go
		body := []byte(`{"results":[
			{"id":438631,"title":"Dune","release_date":"2021-10-22","poster_path":"/dune.jpg"},
			{"id":841,"title":"Dune","release_date":"1984-12-14","poster_path":"/dune84.jpg"},
			{"id":99,"title":"No Date","release_date":"","poster_path":""}
		]}`)
```

After the existing `got[0]` assertion, add:

```go
		if got[0].PosterPath != "/dune.jpg" {
			t.Errorf("[0] poster = %q, want /dune.jpg", got[0].PosterPath)
		}
		if got[2].PosterPath != "" {
			t.Errorf("[2] poster = %q, want empty", got[2].PosterPath)
		}
```

In `TestParseTMDBMovie` "valid body" subtest, add `poster_path` and assert:

```go
		got, err := parseTMDBMovie([]byte(`{"id":438631,"title":"Dune","release_date":"2021-10-22","poster_path":"/dune.jpg"}`))
```
```go
		if got.PosterPath != "/dune.jpg" {
			t.Errorf("poster = %q, want /dune.jpg", got.PosterPath)
		}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test -run 'TestPosterURL|TestParseTMDB' ./...`
Expected: FAIL — `posterURL` undefined and `movieResult` has no `PosterPath` field.

- [ ] **Step 3: Implement in `backend/tmdb.go`**

Add `PosterPath` to `movieResult`:

```go
type movieResult struct {
	TMDBID      int32
	Title       string
	ReleaseYear *int32
	PosterPath  string // raw TMDB poster_path ("" when none); URL built at DTO time
}
```

Add `PosterPath` to `tmdbMovieJSON` and map it in `toResult`:

```go
type tmdbMovieJSON struct {
	ID          int32  `json:"id"`
	Title       string `json:"title"`
	ReleaseDate string `json:"release_date"`
	PosterPath  string `json:"poster_path"`
}

func (m tmdbMovieJSON) toResult() movieResult {
	return movieResult{
		TMDBID:      m.ID,
		Title:       m.Title,
		ReleaseYear: releaseYear(m.ReleaseDate),
		PosterPath:  m.PosterPath,
	}
}
```

Add the pure helper (next to `releaseYear`, with the size constant):

```go
// tmdbImageBase is the TMDB image CDN base + the fixed thumbnail size. The base
// and size buckets are an effectively-static constant (see ADR-0007); we do not
// fetch /configuration. Changing the size later is a one-line edit here.
const tmdbImageBase = "https://image.tmdb.org/t/p/w342"

// posterURL builds a full TMDB poster URL from a raw poster_path, or nil when the
// movie has no poster (empty path). Pure.
func posterURL(path string) *string {
	if path == "" {
		return nil
	}
	u := tmdbImageBase + path
	return &u
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test -run 'TestPosterURL|TestParseTMDB' ./...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/tmdb.go backend/tmdb_test.go
git commit -m "feat: decode TMDB poster_path and add posterURL helper"
```

---

### Task 3: DTO + handler wiring (posterUrl in search and night)

**Goal:** Add `posterUrl` to `movieDTO`, populate it in both the search mapper and the night mapper, and store the poster path on attach. Unit-test both mapping paths.

**Files:**
- Modify: `backend/nights.go`
- Test: `backend/nights_test.go`

**Acceptance Criteria:**
- [ ] `movieDTO` has `PosterURL *string` (`json:"posterUrl"`).
- [ ] `toMovieResults` (search) emits `posterUrl` from `movieResult.PosterPath`.
- [ ] `movieDTOPtr` (night) emits `posterUrl` from `db.Movie.PosterPath`; `null` when absent.
- [ ] `recordNightMovieHandler` stores `PosterPath` via `UpsertMovie`.
- [ ] Unit tests for both mappers pass.

**Verify:** `cd backend && just test` → PASS (includes new `TestToMovieResults` and the extended `TestToNightResponse`).

**Steps:**

- [ ] **Step 1: Write the failing tests**

In `backend/nights_test.go`, extend the `TestToNightResponse` "movie is null when unset and populated when set" subtest to assert `PosterURL`. Set a poster on the populated movie and assert the built URL; assert nil when the column is invalid. After the `m.ReleaseYear = ...` line add:

```go
		m.PosterPath = pgtype.Text{String: "/dune.jpg", Valid: true}
```

Then in that subtest's populated-movie assertion block add:

```go
		if got.Movie.PosterURL == nil || *got.Movie.PosterURL != "https://image.tmdb.org/t/p/w342/dune.jpg" {
			t.Errorf("Movie poster = %v, want built w342 url", got.Movie.PosterURL)
		}
```

And after the `noYear` movie (which has no poster) assert null:

```go
		if got2.Movie.PosterURL != nil {
			t.Errorf("Movie poster = %v, want nil (no poster_path)", got2.Movie.PosterURL)
		}
```

Add a new test for the search mapper:

```go
func TestToMovieResults(t *testing.T) {
	in := []movieResult{
		{TMDBID: 438631, Title: "Dune", ReleaseYear: intp(2021), PosterPath: "/dune.jpg"},
		{TMDBID: 99, Title: "No Poster", ReleaseYear: nil, PosterPath: ""},
	}
	got := toMovieResults(in)
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2", len(got))
	}
	if got[0].PosterURL == nil || *got[0].PosterURL != "https://image.tmdb.org/t/p/w342/dune.jpg" {
		t.Errorf("[0] poster = %v, want built url", got[0].PosterURL)
	}
	if got[1].PosterURL != nil {
		t.Errorf("[1] poster = %v, want nil", got[1].PosterURL)
	}
}
```

(`intp` already exists in `tmdb_test.go`, same package.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test -run 'TestToNightResponse|TestToMovieResults' ./...`
Expected: FAIL — `movieDTO` has no `PosterURL` field.

- [ ] **Step 3: Implement in `backend/nights.go`**

Add the field to `movieDTO`:

```go
type movieDTO struct {
	TMDBID      int32   `json:"tmdbId"`
	Title       string  `json:"title"`
	ReleaseYear *int32  `json:"releaseYear"`
	PosterURL   *string `json:"posterUrl"`
}
```

Add a `pgText` helper next to `int4Ptr`:

```go
// pgText maps a raw string to pgtype.Text for UpsertMovie; "" stores as NULL.
func pgText(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}
```

Set `PosterURL` in the search mapper `toMovieResults`:

```go
func toMovieResults(results []movieResult) []movieDTO {
	out := make([]movieDTO, 0, len(results))
	for _, m := range results {
		out = append(out, movieDTO{
			TMDBID:      m.TMDBID,
			Title:       m.Title,
			ReleaseYear: m.ReleaseYear,
			PosterURL:   posterURL(m.PosterPath),
		})
	}
	return out
}
```

Set `PosterURL` in the night mapper `movieDTOPtr` (note `db.Movie.PosterPath` is `pgtype.Text`; its zero `.String` is `""`, so an invalid value yields `nil` naturally):

```go
func movieDTOPtr(m *db.Movie) *movieDTO {
	if m == nil {
		return nil
	}
	return &movieDTO{
		TMDBID:      m.TmdbID,
		Title:       m.Title,
		ReleaseYear: releaseYearPtr(m.ReleaseYear),
		PosterURL:   posterURL(m.PosterPath.String),
	}
}
```

Store the poster on attach — in `recordNightMovieHandler`, add `PosterPath` to the `UpsertMovieParams`:

```go
		cached, err := store.UpsertMovie(r.Context(), db.UpsertMovieParams{
			TmdbID:      movie.TMDBID,
			Title:       movie.Title,
			ReleaseYear: int4Ptr(movie.ReleaseYear),
			PosterPath:  pgText(movie.PosterPath),
		})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && just test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/nights.go backend/nights_test.go
git commit -m "feat: emit posterUrl in search + night DTOs; store poster_path on attach"
```

---

### Task 4: Backend integration tests for posters

**Goal:** Prove end-to-end (real Postgres + fake TMDB upstream) that search returns built `posterUrl`, attach persists the raw `poster_path` and the night DTO carries `posterUrl`, and a no-poster movie yields `null`.

**Files:**
- Modify: `backend/movies_integration_test.go`

**Acceptance Criteria:**
- [ ] Fake TMDB upstream returns `poster_path` for known movies and includes a no-poster movie.
- [ ] Search assertion checks `posterUrl` is the built `w342` URL.
- [ ] Attach assertion checks the night DTO `posterUrl` AND that the `movies` row stored the raw path.
- [ ] A no-poster movie attaches with `posterUrl == nil`.

**Verify:** `cd backend && just test-integration` → PASS (needs Podman per `.env`).

**Steps:**

- [ ] **Step 1: Add poster_path to the fake upstream**

In `backend/movies_integration_test.go` `fakeTMDB`, add `poster_path` to the existing handlers and add a no-poster movie (id `555`). Update the three existing bodies and add a handler:

```go
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
```

- [ ] **Step 2: Assert posterUrl on search**

In the "search returns mapped results" subtest, after the existing assertion add:

```go
		if got[0].PosterURL == nil || *got[0].PosterURL != "https://image.tmdb.org/t/p/w342/dune.jpg" {
			t.Fatalf("search poster = %v, want built w342 url", got[0].PosterURL)
		}
```

- [ ] **Step 3: Assert posterUrl + stored path on attach**

In the "attach sets the movie on the night and caches it" subtest, after the `n.Movie` assertion add the DTO check, then verify the stored raw path:

```go
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
```

- [ ] **Step 4: Add a no-poster attach subtest**

Add a new subtest (after the "attach ... caches it" subtest):

```go
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
```

- [ ] **Step 5: Run integration tests**

Run: `cd backend && just test-integration`
Expected: PASS (all subtests, including the new no-poster case).

- [ ] **Step 6: Commit**

```bash
git add backend/movies_integration_test.go
git commit -m "test: integration coverage for poster_path through search and attach"
```

---

### Task 5: Mobile lib — Movie.posterUrl + parseMovie + tests

**Goal:** Add `posterUrl` to the `Movie` type and validate it in `parseMovie`; update all lib tests (unit + integration fixtures) so the type, runtime parsing, and `just check` stay consistent.

**Files:**
- Modify: `mobile/lib/movies.ts`
- Test: `mobile/lib/movies.test.ts`, `mobile/lib/movies.integration.test.ts`, `mobile/lib/nights.test.ts`

**Acceptance Criteria:**
- [ ] `Movie` has `posterUrl: string | null`; `parseMovie` returns it (string / null / missing → null) and rejects a non-string.
- [ ] All existing `Movie`/`Night` test fixtures include `posterUrl` (typecheck green).
- [ ] `just check` (lint + typecheck + test) passes.

**Verify:** `cd mobile && just check` → PASS.

**Steps:**

- [ ] **Step 1: Write the failing tests**

In `mobile/lib/movies.test.ts`, update the valid-shape expectation and add cases. Change the first test's expected object and add poster cases:

```ts
test("parseMovie accepts a valid movie", () => {
  const m = parseMovie({ tmdbId: 438631, title: "Dune", releaseYear: 2021, posterUrl: "https://img/x.jpg" });
  assert.deepEqual(m, { tmdbId: 438631, title: "Dune", releaseYear: 2021, posterUrl: "https://img/x.jpg" });
});

test("parseMovie treats null and missing posterUrl as null", () => {
  assert.equal(parseMovie({ tmdbId: 1, title: "X", posterUrl: null }).posterUrl, null);
  assert.equal(parseMovie({ tmdbId: 1, title: "X" }).posterUrl, null);
});

test("parseMovie rejects a non-string posterUrl", () => {
  assert.throws(() => parseMovie({ tmdbId: 1, title: "X", posterUrl: 5 }), /posterUrl/);
});
```

In the existing "parseMovie treats null and missing releaseYear as null" test, the returned objects now also have `posterUrl` — those use `.releaseYear` access so they remain valid; no change needed.

In `mobile/lib/nights.test.ts`, update the "reads an attached movie" expectation to include `posterUrl`:

```ts
test("parseNight reads an attached movie", () => {
  const n = parseNight({
    ...valid,
    movie: { tmdbId: 438631, title: "Dune", releaseYear: 2021, posterUrl: "https://img/x.jpg" },
  });
  assert.deepEqual(n.movie, { tmdbId: 438631, title: "Dune", releaseYear: 2021, posterUrl: "https://img/x.jpg" });
});
```

In `mobile/lib/movies.integration.test.ts`, the `nightWithMovie: Night` literal and its assertion must include `posterUrl` (else typecheck fails once `Movie` requires it). Update the literal and the deepEqual:

```ts
  const nightWithMovie: Night = {
    id: NIGHT,
    scheduledFor: "2026-06-12",
    pickerId: null,
    movie: { tmdbId: 438631, title: "Dune", releaseYear: 2021, posterUrl: "https://image.tmdb.org/t/p/w342/dune.jpg" },
    attendees: [],
  };
```
```ts
    assert.deepEqual(got.movie, { tmdbId: 438631, title: "Dune", releaseYear: 2021, posterUrl: "https://image.tmdb.org/t/p/w342/dune.jpg" });
```

(The `searchMovies` server stubs in both test files return objects without `posterUrl`; that is valid input — `parseMovie` maps missing → null — and the existing assertions read other fields, so they keep passing. Leave them, or add a `posterUrl` assertion if desired.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && just typecheck`
Expected: FAIL — `Movie` has no `posterUrl` property (the new test literals and assertions reference it).

- [ ] **Step 3: Implement in `mobile/lib/movies.ts`**

Add the field to `Movie` and validate it in `parseMovie`:

```ts
export type Movie = {
  tmdbId: number;
  title: string;
  releaseYear: number | null;
  posterUrl: string | null;
};
```

In `parseMovie`, destructure `posterUrl`, validate, and return it:

```ts
  const { tmdbId, title, releaseYear, posterUrl } = raw as Record<string, unknown>;
  if (typeof tmdbId !== "number") {
    throw new Error("movie: tmdbId must be a number");
  }
  if (typeof title !== "string") {
    throw new Error("movie: title must be a string");
  }
  if (releaseYear !== undefined && releaseYear !== null && typeof releaseYear !== "number") {
    throw new Error("movie: releaseYear must be a number or null");
  }
  if (posterUrl !== undefined && posterUrl !== null && typeof posterUrl !== "string") {
    throw new Error("movie: posterUrl must be a string or null");
  }
  return {
    tmdbId,
    title,
    releaseYear: releaseYear ?? null,
    posterUrl: (posterUrl as string | null | undefined) ?? null,
  };
```

(`lib/nights.ts` needs no change — `parseNight` already delegates the night's movie to `parseMovie`.)

- [ ] **Step 4: Run the full mobile check**

Run: `cd mobile && just check`
Expected: PASS (lint + typecheck + all tests, including the integration tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/movies.ts mobile/lib/movies.test.ts mobile/lib/movies.integration.test.ts mobile/lib/nights.test.ts
git commit -m "feat(mobile): add Movie.posterUrl with parseMovie validation"
```

---

### Task 6: Mobile UI — poster thumbnails on the night screen

**Goal:** Render a small poster thumbnail (built-in RN `Image`) in both the search-result rows and the attached-movie row, with a plain placeholder box when `posterUrl` is null.

**Files:**
- Modify: `mobile/app/night.tsx`

**Acceptance Criteria:**
- [ ] A `Poster` component renders an `<Image>` for a URL and a plain neutral box for `null`, at one fixed small size (~46×69, 2:3 ratio).
- [ ] It appears at the same size in each search-result `Pressable` and in the attached-movie row.
- [ ] `just check` (lint + typecheck + test) passes.
- [ ] Manual: with TMDB configured, search shows thumbnails; attaching shows the poster next to the title; a no-poster film shows the placeholder, not a broken image.

**Verify:** `cd mobile && just check` → PASS; then `just start` and exercise search/attach on the night screen (see `mobile/README.md`).

**Steps:**

- [ ] **Step 1: Add `Image` to the imports and a `Poster` component**

In `mobile/app/night.tsx`, add `Image` to the `react-native` import. Then define a small component above `NightScreen` (or just below the imports). Per `mobile/AGENTS.md`, the built-in `Image` from `react-native` renders a remote `uri` with no extra dependency:

```tsx
// Poster renders a fixed-size TMDB thumbnail, or a plain neutral box when the
// movie has no poster (posterUrl null) — never a broken-image icon.
function Poster({ uri }: { uri: string | null }) {
  if (uri === null) {
    return <View style={[styles.poster, styles.posterPlaceholder]} />;
  }
  return <Image source={{ uri }} style={styles.poster} resizeMode="cover" />;
}
```

- [ ] **Step 2: Render the poster in the attached-movie row**

Replace the attached-movie `View` (currently `styles.movieRow` with the label + Change button) so the poster sits left of the label:

```tsx
            <View style={styles.movieRow}>
              <View style={styles.movieInfo}>
                <Poster uri={night.movie.posterUrl} />
                <Text style={styles.name}>{movieLabel(night.movie)}</Text>
              </View>
              <Button title="Change movie" onPress={() => setChangingMovie(true)} disabled={busy !== null} />
            </View>
```

- [ ] **Step 3: Render the poster in each search-result row**

In the `results.map(...)` `Pressable`, put the poster before the label:

```tsx
                <Pressable
                  key={m.tmdbId}
                  onPress={() => onAttach(m.tmdbId)}
                  disabled={busy !== null}
                  style={({ pressed }) => [styles.resultRow, pressed && styles.rowPressed]}
                >
                  <Poster uri={m.posterUrl} />
                  <Text style={[styles.name, styles.resultLabel]}>{movieLabel(m)}</Text>
                  {busy === "movie" ? <Text style={styles.tag}>…</Text> : null}
                </Pressable>
```

- [ ] **Step 4: Add styles**

In the `StyleSheet.create({...})`, add:

```tsx
  poster: { width: 46, height: 69, borderRadius: 4, backgroundColor: "#eee" },
  posterPlaceholder: { borderWidth: StyleSheet.hairlineWidth, borderColor: "#ccc" },
  movieInfo: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  resultLabel: { flex: 1 },
```

(`movieRow` already lays out row + space-between; `movieInfo` groups the poster+label on its left. The result rows previously reused `orderRow`; the new `resultRow` adds the poster gap. Leave `orderRow` as-is for the pick-order list.)

- [ ] **Step 5: Verify the mobile check**

Run: `cd mobile && just check`
Expected: PASS (lint + typecheck + test).

- [ ] **Step 6: Manual smoke (with TMDB configured)**

Run the backend (`cd backend && just run`, `TMDB_READ_TOKEN` set) and `cd mobile && just start`. On the night screen: search a title → results show thumbnails; tap one → the attached row shows the poster + `Title (Year)`; try a film TMDB has no poster for → a plain box, not a broken-image icon.

- [ ] **Step 7: Commit**

```bash
git add mobile/app/night.tsx
git commit -m "feat(mobile): show poster thumbnails in search results and attached movie"
```

---

## Self-Review

- **Spec coverage:** migration + nullable column (Task 1); raw `poster_path` stored (Tasks 1, 3); `posterURL` `w342` helper (Task 2); TMDB client carries path (Task 2); `posterUrl` in both search + night DTOs (Task 3); store-on-attach (Task 3); backend unit + integration tests incl. no-poster null (Tasks 2–4); mobile `Movie.posterUrl` + `parseMovie` + tests (Task 5); UI thumbnails + plain placeholder, same size both places (Task 6); `schema.dbml` (Task 1); no new ADR (none scheduled). All spec sections map to a task.
- **No placeholders:** every code/test step shows the actual code and the exact verify command.
- **Type consistency:** `posterURL(string) *string`, `movieResult.PosterPath string`, `pgText(string) pgtype.Text`, `db.Movie.PosterPath pgtype.Text`, `movieDTO.PosterURL *string`/`posterUrl`, mobile `Movie.posterUrl: string | null` — used consistently across tasks.
- **Build integrity between tasks:** after Task 1 the handler not yet setting `PosterPath` still compiles (NULL default); `posterURL` is unused until Task 3 but unused package functions are legal in Go.

## Out of scope (deferred — from the spec)

Responsive/multi-size selection; `/configuration` fetch; backdrop images; full-screen poster view; image caching beyond RN `Image`.
