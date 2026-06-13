# Movie Posters — Design

**Date:** 2026-06-13
**Status:** Approved (brainstorm)
**ADRs:** [ADR-0007](../../adr/0007-tmdb-proxy-source-of-truth.md) (TMDB proxy; server is source of truth, builds image URLs). No new ADR — this is an additive extension.
**Follows:** [Attach a Movie (TMDB live search)](2026-06-10-attach-movie-tmdb-design.md) — that slice rendered **title + year only** and named posters a "trivial later enhancement." This is it.

## Goal

Show a **poster thumbnail** next to each movie — in the TMDB search results and on the
attached "Tonight's movie" — so the group recognises a film at a glance instead of reading
a title string. Purely additive: no new endpoints, no status-code changes, no change to the
attach flow.

## Decisions (from brainstorm)

1. **Backend builds the full image URL** (hardcoded base + size). TMDB returns only a relative
   `poster_path` (e.g. `/abc.jpg`); the backend assembles `https://image.tmdb.org/t/p/w342{path}`
   and the DTO carries a ready-to-render `posterUrl`. The mobile app stays a pure client and
   never learns TMDB's image conventions (ADR-0002 / ADR-0007).
2. **Not** a `/configuration` fetch. The image base and size buckets are an effectively-static
   constant; caching infrastructure for them is the speculative layer the "build as we go"
   convention warns against. The downside of a hardcoded value is mild and recoverable (a
   broken thumbnail; a one-line constant fix), so YAGNI wins.
3. **Store the raw `poster_path`**, not a built URL. The base/size is a *presentation* concern
   resolved at DTO-render time, so switching size later is a constant edit — never a migration
   or a re-fetch of cached rows. This also keeps every future option open server-side (a
   larger bucket, multiple sizes, or emitting the bare path) without predicting it now.
4. **Fixed size `w342`** — comfortable for a retina/high-DPI thumbnail, and large enough that
   the same URL looks fine if the Expo client is ever run as a web frontend. True
   responsive/per-density sizing is out of scope (and, notably, would *not* require the
   `/configuration` fetch either — the buckets are a hardcodable constant).
5. **Poster is nullable end-to-end.** TMDB frequently has no poster; `poster_path` → DB NULL →
   `posterUrl` JSON `null` → a neutral placeholder box on mobile (never a broken-image icon).
6. **Same small thumbnail in both places** (search rows and the attached movie); **plain
   neutral box** as the no-poster placeholder. Consistent and minimal.

## The shared seam

The poster rides **two existing paths** that converge on one JSON type, `movieDTO`:

- **Search** `/movies/search`: TMDB → `parseTMDBSearch` → `movieResult` → `toMovieResults` → `movieDTO`. No DB.
- **Night/attach** `.../movie` + every night read: TMDB `FetchMovie` → `UpsertMovie` (stores
  `poster_path`) → `GetMovie` → `movieDTOPtr` → `movieDTO`.

So the raw path is carried through both, and the full URL is built in **one pure helper** that
both `movieDTO` mappers call:

```go
// posterURL builds a TMDB poster URL at a fixed thumbnail size, or nil when the
// movie has no poster. The base/size is a constant (TMDB's CDN, stable); see
// ADR-0007. Pure. "/abc.jpg" → "https://image.tmdb.org/t/p/w342/abc.jpg"; nil/"" → nil.
func posterURL(path *string) *string
```

## Schema — migration `0006_movie_poster.sql`

```sql
-- +goose Up
ALTER TABLE movies ADD COLUMN poster_path varchar NULL;

-- +goose Down
ALTER TABLE movies DROP COLUMN IF EXISTS poster_path;
```

`poster_path` is the raw TMDB path; **nullable** (TMDB often has none). `ADD COLUMN` appends it
physically last (after `cached_at`) — it does **not** ripple into the five night queries, which
select `picks` columns, not `movies`. (The physical-column-order care from the attach slice was
specific to reusing `db.Pick`; nothing here touches `picks`.)

## Backend — queries

`internal/db/query/movies.sql`: add `poster_path` (listed **last**, matching physical order) to:

- `UpsertMovie` — insert column + value, the `ON CONFLICT … DO UPDATE SET` list, and `RETURNING`.
- `GetMovie` — the `SELECT` column list.

Then `just sqlc`. `db.Movie` gains `PosterPath pgtype.Text`; `UpsertMovieParams` gains `PosterPath`.

## Backend — TMDB client (`tmdb.go`)

- `tmdbMovieJSON` gains a `PosterPath` field decoding the `poster_path` JSON key.
- `movieResult` gains `PosterPath *string`.
- `toResult()` maps it, blank → nil (mirroring `releaseYear`). Both `parseTMDBSearch` and
  `parseTMDBMovie` then carry it with no further change.

## Backend — DTO + handlers (`nights.go`)

- `movieDTO` gains `PosterURL *string` serialised as the `posterUrl` JSON key.
- `toMovieResults` (search) sets `PosterURL: posterURL(m.PosterPath)`.
- `movieDTOPtr` (night) sets `PosterURL: posterURL(textToPtr(m.PosterPath))` — a small nil-safe
  `pgtype.Text → *string` helper (parallel to `releaseYearPtr`).
- `recordNightMovieHandler` passes `movie.PosterPath` into `UpsertMovieParams`.

No handler flow, route, or status-code changes — posters are additive on every path.

## Night / search DTO shape

```json
{ "tmdbId": 438631, "title": "Dune", "releaseYear": 2021,
  "posterUrl": "https://image.tmdb.org/t/p/w342/d5NXSklXo0qyIYkgV94XAgMIckC.jpg" }
```

`posterUrl` is `null` when TMDB has no poster, exactly as `releaseYear` is `null` with no date.

## Mobile

- **`lib/movies.ts`**: `Movie` gains `posterUrl: string | null`; `parseMovie` validates it
  (string-or-null, missing → null — same tolerance as `releaseYear`).
- **`lib/nights.ts`**: no change needed — `parseNight` already validates the night's movie via
  `parseMovie`, so the night path inherits `posterUrl` for free.
- **`app/night.tsx`**: render a small poster thumbnail (React Native's built-in `Image`, ~46×69
  at the 2:3 poster ratio — **no new dependency**) in **both** the search-result rows and the
  attached-movie row, at the **same** size. When `posterUrl` is `null`, render a **plain neutral
  placeholder box** (rounded, bordered, same dimensions) — never a broken-image icon. Follow the
  exact Expo SDK 54 docs per [`mobile/AGENTS.md`](../../../mobile/AGENTS.md) when implementing.

## Testing

**Backend**
- *Unit (pure, table-driven, no mocks):*
  - `posterURL` — `"/abc.jpg"` → `…/w342/abc.jpg`; `nil`/`""` → `nil`.
  - `parseTMDBSearch` / `parseTMDBMovie` — map `poster_path`; tolerate missing/blank → nil.
  - `toMovieResults` (search) and `movieDTOPtr` (night) — emit `posterUrl`, and `null` when absent.
- *Integration (testcontainers + httptest fake TMDB upstream):*
  - search → results carry `posterUrl` built from the fake `poster_path`.
  - attach → night DTO carries `posterUrl` **and** the `movies` row stored the raw `poster_path`.
  - a movie whose fake upstream has no `poster_path` → `posterUrl` `null` end-to-end.

**Mobile**
- *Unit (`node:test` via `tsx`):* `parseMovie` accepts `posterUrl` string / `null` / missing and
  rejects a non-string; `searchMovies` and `parseNight` carry `posterUrl`.
- *Integration (real local HTTP server, real `fetch`):* extend the existing search→attach test
  to assert `posterUrl` on the returned night.

## Documentation

- **`docs/schema.dbml`**: add `movies.poster_path` (nullable, with a "raw TMDB path; URL built at
  render time" note).
- **No new ADR** — additive extension under ADR-0007. This spec records the `w342` choice.

## Out of scope (deferred)

- **Responsive / multi-size selection** (per-density or per-breakpoint buckets) — fixed `w342`
  this slice. Would be its own slice and is cheap to reach later because the raw path is stored.
- **`/configuration` fetch** for the image base/sizes — the constant suffices.
- **Backdrop images, full-screen poster view, an image cache** beyond what RN `Image` provides.
