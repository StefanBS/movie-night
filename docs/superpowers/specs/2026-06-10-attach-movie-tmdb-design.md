# Attach a Movie (TMDB live search) — Design

**Date:** 2026-06-10
**Status:** Approved (brainstorm)
**ADRs:** [ADR-0002](../../adr/0002-go-postgres-expo-tmdb-stack.md) (TMDB metadata, backend-as-JSON-API), [ADR-0005](../../adr/0005-least-served-turn-ranking.md) (a night = a `picks` row); introduces **ADR-0007** (TMDB proxy + server-is-source-of-truth on attach).
**Follows:** [Record-pick / Night Reconciliation](2026-06-10-record-pick-night-reconciliation-design.md) — that slice deferred "attaching a movie to the night (TMDB)" as a later slice. This is it.

## Goal

Complete the core loop — *whose turn → record the pick → **what did they pick***. A night
(`picks` row) is planned first, then a picker is recorded; this slice lets the group
**attach the actual film** via **live TMDB search**: type a title, tap a result, and the
night carries the movie. Attaching is **correctable** (tap "change movie") the same way
re-recording the picker is, until a new night is started.

## Decisions (from brainstorm)

1. **Live TMDB search**, not paste-an-id or manual entry. Search results show **title +
   year only** — no posters this slice (a trivial later enhancement).
2. **Backend proxies TMDB** — the API token stays server-side and attribution lives in one
   place; mobile stays a pure client (ADR-0002). The phone never calls TMDB directly.
3. **Server is the source of truth on attach.** The client sends only `tmdbId`; the backend
   re-fetches canonical `title`/`release_year` from TMDB `/movie/{id}` and caches them. The
   client-supplied search metadata is never trusted for the stored record.
4. **Attach is correctable / repeatable** — `SetNightMovie` is an `UPDATE`; attaching a
   different movie just swaps `picks.movie_id`, mirroring the re-pick correction path.
5. **TMDB auth: v4 Read Access Token** sent as `Authorization: Bearer <token>`, env
   `TMDB_READ_TOKEN`. (If a key turns out to be the older v3 hex key, switch to the
   `?api_key=` query param and `TMDB_API_KEY` — single-spot change in the client.)
6. **TMDB is optional config.** Unset token → the search and attach paths return `503`; the
   rest of the app works unchanged. Logged at startup like `CORS_ALLOWED_ORIGINS`.

## Schema — migration `0005_movies.sql`

A new `movies` table (cache of TMDB metadata, keyed by `tmdb_id`) and a nullable
`movie_id` on `picks`:

```sql
-- +goose Up
CREATE TABLE movies (
    id           uuid        PRIMARY KEY DEFAULT uuidv7(),
    tmdb_id      integer     NOT NULL UNIQUE,
    title        varchar     NOT NULL,
    release_year integer         NULL,
    cached_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE picks
    ADD COLUMN movie_id uuid NULL REFERENCES movies(id) ON DELETE RESTRICT;

-- +goose Down
ALTER TABLE picks DROP COLUMN IF EXISTS movie_id;
DROP TABLE IF EXISTS movies;
```

**`movie_id` is nullable** — a planned night exists before any movie is attached. This
diverges from `docs/schema.dbml`, which sketched it `NOT NULL`; the dbml is the
plan-only-at-the-end shape, reality is plan-first. **Update `docs/schema.dbml`** to mark
`movie_id` nullable with a note. `ON DELETE RESTRICT` keeps a movie that any night
references (history is preserved — same intent as the dbml's delete rules).

## Backend — queries

New `internal/db/query/movies.sql`:

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
RETURNING id, group_id, picker_id, is_credited, movie_id, scheduled_for, created_at;
```

`UpsertMovie` is idempotent cache-by-`tmdb_id`: re-attaching the same film refreshes its
title/year and reuses the one `movies` row. `GetMovie` (by internal id) renders the DTO.

**Touch the five existing night queries** (`nights.sql`): add `movie_id` to each
SELECT/RETURNING column list (`CreateNight`, `GetNight`, `GetCurrentNight`, `GetOpenNight`,
`SetNightPicker`). The list must keep matching the full `picks` table so sqlc continues to
map these to `db.Pick` (now gaining `MovieID pgtype.UUID`) rather than minting a divergent
row type that would ripple through `nights.go`. Then `just sqlc`.

## Backend — TMDB client (`tmdb.go`)

A small HTTP client; `baseURL` is injectable so the integration test points it at an
`httptest` fake upstream (real HTTP, fake TMDB — the same spirit as the mobile integration
tests' real-local-server pattern).

```go
type tmdbClient struct {
    baseURL string        // https://api.themoviedb.org/3 in prod; httptest URL in tests
    token   string        // v4 Read Access Token
    http    *http.Client  // with a request timeout
}

type movieResult struct {   // the proxy/attach shape — title + year only
    TMDBID      int
    Title       string
    ReleaseYear *int        // nil when TMDB has no/blank release_date
}

func (c *tmdbClient) SearchMovies(ctx context.Context, query string) ([]movieResult, error)
func (c *tmdbClient) FetchMovie(ctx context.Context, tmdbID int) (movieResult, error)
```

(The client's single-movie fetch is `FetchMovie`, deliberately *not* `GetMovie` — that name
is the DB query, and the attach handler calls both.)

- `SearchMovies` → `GET {base}/search/movie?query=…&include_adult=false`.
- `FetchMovie` → `GET {base}/movie/{id}`; a TMDB `404` maps to a sentinel `errMovieNotFound`
  so the handler can return `404`.
- Both set `Authorization: Bearer <token>` and `Accept: application/json`.

**Pure, unit-tested helpers** (no network): `parseTMDBSearch(body) ([]movieResult, error)`,
`parseTMDBMovie(body) (movieResult, error)`, and `releaseYear(s string) *int` (parses the
`YYYY-MM-DD` `release_date`/blank → nil). The client methods are thin wrappers over these.

A nil/unconfigured client (empty token) is represented as `*tmdbClient == nil`; the
handlers check for it and return `503`.

## Backend — endpoints + wiring

**`GET /movies/search?q=…`** — un-grouped (TMDB search is not group-scoped).
- empty `q` → `400`; TMDB unconfigured → `503`; upstream failure → `502`;
- else `200` `[{ "tmdbId": 438631, "title": "Dune", "releaseYear": 2021 }, …]`
  (`releaseYear` may be `null`).

**`POST /groups/{groupId}/nights/{nightId}/movie`**, body `{ "tmdbId": 438631 }`.
Handler flow (mirrors `recordNightPickHandler`: parse → ensure → act → return DTO):
1. `parseGroupAndNight` → `400` on malformed `groupId`/`nightId`.
2. Decode body; `tmdbId` must be a positive integer → `400`.
3. `ensureNight` → `404` if the night isn't in the group.
4. **`client.FetchMovie(tmdbId)`** (server is source of truth): unconfigured → `503`,
   `errMovieNotFound` → `404` ("no such movie"), other upstream error → `502`.
5. `UpsertMovie(tmdbId, title, releaseYear)` → the cached movie row (id).
6. `SetNightMovie(nightId, gid, movie.id)` — repeatable; a different movie is the
   **change** path.
7. Return the **night DTO** (now carrying `movie`) at `200`.

`main.go`: read `TMDB_READ_TOKEN`; build the client (real base URL) when set, else pass a
nil client; log whether TMDB is configured (like CORS). Register the two routes. Add the
var to `backend/.env.example`. `nightStore` grows `UpsertMovie`, `GetMovie`, `SetNightMovie`;
the search handler takes the `*tmdbClient` (it needs no store), the attach handler takes
both.

## Night DTO gains `movie`

```json
{
  "id": "<nightId>",
  "scheduledFor": "2026-06-12",
  "pickerId": "<uuid>|null",
  "movie": { "tmdbId": 438631, "title": "Dune", "releaseYear": 2021 },
  "attendees": [ … ]
}
```

`movie` renders `null` until one is attached, and `releaseYear` is `null` when TMDB has no
release date. In `writeNightDTO`: when `Pick.MovieID` is valid, one `GetMovie` lookup fills
the field; otherwise `null`. The extra query runs only when a movie is attached.

## Mobile

- **`lib/movies.ts`** (new): `Movie = { tmdbId: number; title: string; releaseYear: number | null }`;
  `parseMovie(raw)` validation; `searchMovies(baseUrl, q, signal?) → Movie[]`;
  `attachMovie(baseUrl, groupId, nightId, tmdbId, signal?) → Night`. (Attach sends only
  `tmdbId`.)
- **`lib/nights.ts`**: `Night` gains `movie: Movie | null`; `parseNight` validates it
  (object-or-null, reusing `parseMovie`).
- **`app/night.tsx`**: a **"Tonight's movie"** section under the heading.
  - No movie attached → a search `TextInput` + a results list; tapping a result calls
    `attachMovie(tmdbId)` and updates the night.
  - Movie attached → shows `Title (Year)` with a **"Change movie"** action that reopens the
    search. Re-tapping a result swaps it.
  - In-flight/disabled and error-line handling reuse the existing `busy`/`actionError`
    pattern (one op at a time; failures surface in the banner). Search-box typing should not
    fight the single-op `busy` lock — searching is a read and can run while idle; attaching
    takes the lock like the other writes.

## Documentation

- **ADR-0007 — TMDB proxy; server is source of truth on attach.** Records: the backend
  proxies TMDB (token server-side via `TMDB_READ_TOKEN`, attribution centralized, mobile
  stays a pure client); attach re-fetches canonical metadata from TMDB `/movie/{id}` rather
  than trusting client-supplied fields; `movies` is a cache keyed by `tmdb_id`. Add to the
  ADR index; promote nothing from the backlog (this isn't watch-providers).
- **`docs/schema.dbml`**: change `picks.movie_id` to nullable with a "plan-first; attached
  later" note.

## Testing

**Backend**
- *Unit (pure, table-driven, no mocks):*
  - `parseTMDBSearch` — maps results; tolerates a missing/blank `release_date`.
  - `parseTMDBMovie` — single-movie body → `movieResult`.
  - `releaseYear` — `"2021-10-22"` → `2021`; `""`/malformed → `nil`.
  - attach-body validation — `tmdbId` non-positive / missing → error.
  - night DTO `movie` mapping — both `null` (unset) and a populated movie.
- *Integration (testcontainers + an `httptest` fake TMDB upstream):*
  - search → mapped `[{tmdbId,title,releaseYear}]`.
  - attach a movie → DTO carries `movie`; a `movies` row exists.
  - **re-attach a different movie → DTO movie updated** (the change path).
  - **upsert idempotency** — attach the same `tmdbId` on two nights → a single `movies`
    row, both nights reference it.
  - unknown `tmdbId` (fake upstream returns 404) → `404`.
  - TMDB unconfigured (nil client) → search and attach return `503`.
  - malformed body / unknown night → `400` / `404`.

**Mobile**
- Unit (`node:test` via `tsx`): `searchMovies` (path + `q` query, parsed result, throw on
  non-2xx), `attachMovie` (method/path/body `{tmdbId}`, parsed `Night`, throw on non-2xx),
  `parseMovie` (valid + bad shapes), `parseNight` accepting `movie` set + `null`.
- Integration (real local HTTP server, real `fetch`): search then attach, asserting the
  returned night carries the movie.

## Out of scope (deferred)

- **Posters / images** — title + year only this slice; poster paths + TMDB image config are
  a later enhancement.
- **Watch-provider streaming availability** — remains in the [backlog](../../adr/backlog.md).
- **Watchlists & reviews** (the `watchlist_items` / `reviews` tables in the dbml) — unbuilt.
- **Un-attaching** a movie (clearing `movie_id`) — correction only swaps to another movie.
- **Auth / permissions** — backlog "Authentication and account model".
