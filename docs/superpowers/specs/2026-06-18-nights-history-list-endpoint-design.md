# Nights history list endpoint — design

Date: 2026-06-18
Issue: #39 (Backend P2.1) · Epic #28 · Phase 2 (backend)
Related: #36 (History tab — the consumer), #40 (reactions — deferred), #19 (single-night movie round-trip — tech debt)

## Goal

Add `GET /groups/{groupId}/nights` returning a group's **recorded** nights
(newest first) so the History tab (#36) can render its month-grouped list and
stat strip. Add the matching `listNights` client + parser in `mobile/lib/nights.ts`
and wire the History screen to fetch from it.

## Contract

- **Route:** `GET /groups/{groupId}/nights`
- **Response:** a JSON **array** of nights, each the existing `nightResponse`
  shape — `{ id, scheduledFor, pickerId, movie, attendees }` — so the mobile
  `Night` type and `parseNight` are reused verbatim (one new array wrapper).
- **Which nights:** recorded only — `picker_id IS NOT NULL`. This excludes the
  open/planned night (picker NULL) and matches the issue's "recorded nights"
  wording. A recorded night with no movie still appears (renders "Untitled
  night"), consistent with `historyStats` counting movie-less nights.
- **Order:** newest first — `ORDER BY scheduled_for DESC, created_at DESC` (the
  same tiebreak as `GetCurrentNight`). The mobile `buildHistoryMonths` re-sorts
  defensively, but the contract is sorted.
- **Empty group:** `200` with `[]` (not `404`).
- **Invalid `groupId`:** `400` (via the existing `pathUUID` helper).
- **No `reaction` field** — reactions are #40; the `Night` model has none yet
  (`historyStats` hardcodes `loved: 0` with a `TODO(#40)`).
- **No pagination** — single-group learning-project scale; returns all recorded
  nights. Revisit if/when history grows.

## Backend

### Queries (`internal/db/query/nights.sql`, then `just sqlc`)

Two new queries. Both are set-based so the handler issues a **constant two
queries regardless of N** (no N+1 across the list).

**`ListRecordedNights` — picks LEFT JOIN movies, movie columns nullable.**

```sql
-- name: ListRecordedNights :many
SELECT
  p.id, p.group_id, p.picker_id, p.is_credited, p.scheduled_for, p.created_at, p.movie_id,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path
FROM picks p
LEFT JOIN movies m ON m.id = p.movie_id
WHERE p.group_id = sqlc.arg(group_id) AND p.picker_id IS NOT NULL
ORDER BY p.scheduled_for DESC, p.created_at DESC;
```

The movie columns are selected **explicitly and aliased**, NOT via
`sqlc.embed(movies)`: on a movie-less night the LEFT JOIN yields NULLs, and
embed would scan NULL into `movies.tmdb_id`/`title` (NOT NULL → `int32`/`string`)
and fail. As nullable aliased columns, sqlc generates `pgtype` fields
(`MovieTmdbID pgtype.Int4`, `MovieTitle pgtype.Text`,
`MovieReleaseYear pgtype.Int4`, `MoviePosterPath pgtype.Text`) which the handler
maps to a `*movieDTO`.

**`ListNightsAttendees` — the existing attendee join over a set of night ids.**

```sql
-- name: ListNightsAttendees :many
SELECT a.pick_id, u.id, u.name, m.role
FROM attendances a
JOIN users u ON u.id = a.user_id
JOIN memberships m ON m.user_id = a.user_id AND m.group_id = sqlc.arg(group_id)
WHERE a.pick_id = ANY(sqlc.arg(night_ids)::uuid[])
ORDER BY
  CASE WHEN m.role = 'core' THEN 0 ELSE 1 END,
  u.name;
```

Identical role/name ordering to `ListNightAttendees`, but adds `a.pick_id` to the
projection so the handler can group rows back to their night.

### Handler (`nights.go`)

`listNightsHandler(store nightStore) http.HandlerFunc` serving
`GET /groups/{groupId}/nights`:

1. `gid, ok := pathUUID(w, r, "groupId", "invalid group id")`.
2. `nights, err := store.ListRecordedNights(ctx, gid)` → 500 on error.
3. Collect the night ids into `[]uuid.UUID`. If empty, encode `[]` and return
   (skip the attendees query when there's nothing to group).
4. `attRows, err := store.ListNightsAttendees(ctx, {GroupID: gid, NightIDs: ids})`
   → 500 on error.
5. Group attendees by `pick_id` into `map[uuid.UUID][]attendee` (reusing the
   `attendee` struct).
6. Build `[]nightResponse` in the nights' order: per night, attendees default to
   a non-nil `[]attendee{}` (so an attendee-less night encodes `[]`, not null),
   `pickerId` via the existing `pickerIDPtr`, and `movie` via a new helper that
   builds `*movieDTO` from the nullable movie columns (nil when
   `movie_tmdb_id` is invalid).
7. Encode the array as JSON (`Content-Type: application/json`).

New pure helpers (table-testable, no DB/clock):
- `groupAttendees(rows []db.ListNightsAttendeesRow) map[uuid.UUID][]attendee`
- `movieDTOFromCols(row db.ListRecordedNightsRow) *movieDTO` — mirrors
  `movieDTOPtr` but reads the nullable joined columns (uses the existing
  `releaseYearPtr`/`posterURLPtr` on the `pgtype` values).
- `toNightResponses(rows []db.ListRecordedNightsRow, byNight map[uuid.UUID][]attendee) []nightResponse`
  — assembles the ordered slice.

Add `ListRecordedNights` and `ListNightsAttendees` to the `nightStore` interface
(the real `*db.Queries` satisfies it — no mock, per the codebase convention).

### Route (`main.go`)

```go
mux.Handle("GET /groups/{groupId}/nights", listNightsHandler(queries))
```

Go 1.22 method+path routing distinguishes this from `GET .../nights/current` and
`GET .../nights/{nightId}` — no conflict.

## Mobile (`mobile/lib/nights.ts` + `app/(tabs)/history.tsx`)

### Client + parser (`lib/nights.ts`)

```ts
// parseNights validates an untrusted JSON array and returns typed Nights,
// throwing a descriptive error if the payload or any element is malformed.
export function parseNights(raw: unknown): Night[] {
  if (!Array.isArray(raw)) {
    throw new Error("expected an array of nights");
  }
  return raw.map(parseNight);
}

// listNights loads the group's recorded nights, newest first.
export function listNights(
  baseUrl: string,
  groupId: string,
  signal?: AbortSignal,
): Promise<Night[]> {
  return requestJson(`${baseUrl}/groups/${groupId}/nights`, parseNights, { signal });
}
```

(`parseNight` already throws on a malformed element, so `parseNights` gets
per-element validation for free.)

### Wire the History screen (`app/(tabs)/history.tsx`)

Replace the `const nights: Night[] = []` stub (the `TODO(#39)` seam) with a
fetch, following the `index.tsx` pattern: resolve the API base URL + `GROUP_ID`,
`useEffect` with an `AbortController`, `useState` for `nights` / `loading` /
`error`. Render states:

- **loading** → `ActivityIndicator` (accent), matching Tonight.
- **error** → the danger-tinted "Couldn't load history: …" text (use
  `errorMessage`).
- **empty** (`nights.length === 0`) → the existing "No nights yet — start one."
  empty state.
- **loaded** → the existing stat strip + month-grouped list (unchanged render
  path).

This completes the vertical slice so the endpoint and client aren't dead on
arrival. No change to `lib/history.ts` (`buildHistoryMonths`/`historyStats`).

## Testing

- **Backend unit** (`nights_test.go`, pure, table-driven): `groupAttendees`
  (multiple nights, shared/empty attendees), `movieDTOFromCols` (movie present
  vs. null columns), and `toNightResponses` (order preserved, attendees `[]`
  not null, movie present/absent). No DB, no mocks.
- **Backend integration** (`nights_integration_test.go`, testcontainers, real
  Postgres): seed a group with two recorded nights (one with a movie + attendees,
  one without a movie) and one open night; assert `GET .../nights` returns the
  two recorded nights newest-first, excludes the open night, and carries the
  correct movie + attendee data. Reuse the file's existing seeding helpers.
- **Mobile unit** (`lib/nights.test.ts`, `node:test`, table-driven): `parseNights`
  for a valid array, `[]`, a non-array, and a malformed element (throws). If the
  file already has a real-local-server integration test, add a `listNights` case
  there; otherwise the unit cases suffice (no new server scaffolding just for this).

`backend: just check` + `just test-integration`; `mobile: just check` are the
gates.

## Out of scope (later issues)

- Reactions / `loved` count (#40).
- Pagination / windowing.
- Refactoring the single-night `GetMovie` round-trip (#19) — the list avoids it
  by joining, but the existing single-night path is untouched here.
