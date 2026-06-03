# Record a Pick — Design

**Status:** Proposed · **Date:** 2026-06-02 · **Branch:** `record-pick`

## Goal & context

The third vertical slice, and the app's **first write path**. The roster slice
proved the Postgres → Go → Expo wiring; the turn-ranking slice answered "whose
turn is it tonight?" — both **read-only**, both seeding their data and explicitly
deferring writes. This slice closes that loop: after a movie night, **record who
picked**, so the standings actually advance and the next `GET /turn` reflects it.

It stays a minimal slice in the same "build as we go" discipline: it reuses the
`picks` table the turn slice already created (no migration), adds one insert query,
one HTTP handler, and makes the existing turn screen's member rows tappable. Auth,
movie metadata, attendance persistence, pick edit/delete, and free/guest picks are
all deferred.

## Scope

**In:**

- Go: one sqlc-generated `InsertPick` query and one HTTP handler for
  `POST /groups/{groupId}/picks`.
- Expo: the existing turn screen, augmented so each member row is tappable to
  record that member as tonight's picker (date = device-local today, credited).
  On success it refetches `/turn` and the list reorders.
- Unit tests (pure, table-driven) and an integration test (testcontainers) on the
  backend; unit + real-server integration tests on mobile.

**Out (deferred to later slices):**

- **No schema migration** — the `picks` table already exists (migration `0002`).
- A uniqueness constraint on `(group_id, scheduled_for)` — by decision, this slice
  allows multiple picks per night (see "Duplicate nights" below).
- Free / guest picks (`picker_id = NULL`, `is_credited = false`) — `pickerId` is
  required and the mobile client always sends `isCredited: true`.
- Editing or deleting a recorded pick.
- Persisting attendance (the `attendances` table) and a presence-picker UI.
- Movie metadata (`movie_id`, the `movies` table).
- Auth / accounts.

## Key decisions

These were settled during brainstorming; each is recorded with its rationale so a
later reader sees *why* the minimal choice was deliberate, not accidental.

### Duplicate nights — no uniqueness constraint

Every `POST` inserts a new row; there is no `UNIQUE (group_id, scheduled_for)`.
This matches `docs/schema.dbml`'s **non-unique** `ix_pick_group_date` index and the
"build as we go" rule — we don't add a constraint this slice doesn't need.

**Trade-off, stated plainly:** a double-submit records two picks for one night and
double-counts that member in the standings. We accept this for the skeleton; the
mobile client guards against it with an in-flight lock (taps disabled while a
record is in progress), and a future idempotency/edit slice can add the constraint
and an upsert-or-409 contract when a slice actually needs it.

### Date comes from the client

The request body must carry `scheduledFor`; there is **no server-clock default**.
This keeps the endpoint deterministic and the validation purely unit-testable (no
ambient "now"), and for a phone the device's *local* date is the more correct
notion of "tonight" than the DB server's date. The mobile client computes local
today via a small pure `todayLocalISO()` helper.

### Picker validation — FK-only, with FK-violation → 422

The handler validates `pickerId` is a well-formed UUID and relies on the `users`
foreign key to guarantee the row exists; it does **not** run a separate
group-membership lookup. This matches the turn slice's precedent of minimal
existence-checking, and the mobile UI only ever offers members already returned by
`/turn`, so a bad `pickerId` can only come from a malformed request.

So that "FK-only" isn't silently weak, the handler **catches the Postgres
foreign-key-violation error (`SQLSTATE 23503`) and returns a clean `422`** instead
of a generic `500`. No extra query, honest error contract. A convenient
consequence: a syntactically valid but non-existent `groupId` also trips the
`group_id` FK → `422` — a real error on a write, where `GET /turn` returns
`200 []` for the same unknown group.

**Revisit when a second caller needs it.** The attendance and pick-edit slices will
both need genuine membership checks; building that shared helper then, against a
concrete second use, yields a better abstraction than guessing now.

### Response shape — created pick (clean REST), client refetches

`POST /groups/{groupId}/picks` returns the **created pick resource** (`201`); the
mobile client, on success, re-runs its existing `fetchTurn()` to refresh standings
(two round trips). The alternative — having the write return the re-ranked `/turn`
payload to save a round trip — was rejected for this skeleton because it couples
the write endpoint to the ranking DTO and gives the ranking logic two callers. At
single-digit group sizes the extra round trip is irrelevant, and the decoupled
endpoints are the cleaner foundation. Revisit if a one-call write is ever wanted.

## API contract

`POST /groups/{groupId}/picks`

Request body (JSON):

```json
{ "pickerId": "<uuid>", "scheduledFor": "YYYY-MM-DD", "isCredited": true }
```

- `pickerId` — **required**, a member UUID. (Null/free picks deferred.)
- `scheduledFor` — **required**, an ISO `YYYY-MM-DD` date.
- `isCredited` — **optional**, defaults `true`.

Responses:

- **201 Created** — the created pick:
  ```json
  { "id": "<uuid>", "groupId": "<uuid>", "pickerId": "<uuid>",
    "isCredited": true, "scheduledFor": "YYYY-MM-DD",
    "createdAt": "<RFC3339 timestamp>" }
  ```
- **400 Bad Request** — `groupId` not a valid UUID, malformed JSON body, missing or
  invalid `pickerId` / `scheduledFor`.
- **422 Unprocessable Entity** — `pickerId` (or `groupId`) references no row
  (Postgres FK violation `23503`).
- **500 Internal Server Error** — any other DB error (logged server-side; generic
  message to the client).

## Backend components

New file `picks.go`, mirroring `roster.go` / `turn.go` structure. Reuses the
existing `parseGroupID` and `writeJSONError` helpers.

- `pickRequest` — the decoded request DTO: `PickerID string`,
  `ScheduledFor string`, `IsCredited *bool` (pointer so "omitted" is
  distinguishable and defaults to `true`).
- **Pure** `validatePickRequest(pickRequest) (parsedPick, error)` — validates the
  UUID and date, applies the `isCredited` default, and returns a typed
  `parsedPick { PickerID uuid.UUID; ScheduledFor pgtype.Date; IsCredited bool }`.
  Independently unit-testable; no DB, no `now()`.
- `pickResponse` + **pure** `toPickResponse(db.Pick) pickResponse` — maps the
  inserted row to the JSON DTO, formatting `scheduled_for` as `YYYY-MM-DD` and
  `created_at` as RFC3339. Independently unit-testable.
- `pickStore` interface with the single method
  `InsertPick(ctx, db.InsertPickParams) (db.Pick, error)`, satisfied by the real
  `*db.Queries` — so no mock is ever written (same pattern as `turnStore`).
- `createPickHandler(store)` — `parseGroupID` (→ 400) → decode JSON (→ 400 on
  malformed) → `validatePickRequest` (→ 400) → `store.InsertPick`; on a
  `*pgconn.PgError` with `Code == "23503"` → 422, any other error → 500 (logged);
  success → `201` + `toPickResponse`.
- Wire `mux.Handle("POST /groups/{groupId}/picks", createPickHandler(queries))` in
  `main.go`.

New `internal/db/query/picks.sql`:

```sql
-- name: InsertPick :one
INSERT INTO picks (group_id, picker_id, is_credited, scheduled_for)
VALUES (sqlc.arg(group_id), sqlc.arg(picker_id), sqlc.arg(is_credited), sqlc.arg(scheduled_for))
RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at;
```

`internal/db` gains the generated `picks.sql.go` from `just sqlc`; generated code is
never hand-edited.

## Data flow

Tap a member row → mobile computes `todayLocalISO()` →
`recordPick(API, groupId, { pickerId, scheduledFor, isCredited: true })` →
`POST /groups/{groupId}/picks` → Go handler: `parseGroupID` + decode +
`validatePickRequest` → `store.InsertPick` inserts the row → `201` +
`toPickResponse` → mobile re-runs `fetchTurn()` → the re-ranked list renders with
the just-picked member moved down the standings.

## Mobile

Augment the single existing turn screen — no navigation library, no presence UI.

- New `lib/picks.ts`:
  - **Pure** `parsePick(raw): Pick` — validates the `201` payload shape (mirrors
    `parseTurn` in `lib/turn.ts`).
  - `recordPick(baseUrl, groupId, body, signal?)` — `POST`s the body, expects
    `201`, returns the parsed `Pick`. Reuses `lib/api.ts` for URL resolution.
- New **pure** `todayLocalISO()` helper — formats the device-local date as
  `YYYY-MM-DD` (unit-testable; takes an injectable `Date` for the test).
- `App.tsx` — each member row becomes a `Pressable`. On tap:
  `recordPick(pickerId, todayLocalISO(), true)` → on success refetch via
  `fetchTurn()` so the list reorders. A per-screen in-flight flag disables taps
  while a record is in progress (the double-submit guard). Errors surface through
  the screen's existing error state; loading/empty states unchanged.
- The client always sends `isCredited: true`; guest/free picks land with a later
  slice.

## Error handling

- **Backend:** validate path UUID, JSON body, and each field (→ 400); FK violation
  → 422; other DB errors → 500 + server log; no panics in the request path.
- **Mobile:** explicit in-flight, error (record failed / non-201 / invalid
  payload), and the existing loading/empty states. Taps disabled while recording.

## Testing

Two automated layers plus a manual smoke check. **Unit tests are pure — no mocks,
fakes, or stubs.** Anything needing a database is covered by the integration test
against real Postgres.

- **Unit — pure, table-driven (backend):**
  - `validatePickRequest` — valid input; missing/blank `pickerId`; malformed
    `pickerId` UUID; missing/blank `scheduledFor`; bad date format; `isCredited`
    omitted → `true`; `isCredited` explicit `false` preserved.
  - `toPickResponse` — field mapping, `scheduled_for` → `YYYY-MM-DD`, `created_at`
    → RFC3339.
- **Integration — real Postgres via testcontainers (backend):** migrate → seed →
  drive `createPickHandler` through `httptest`:
  - POST for a seeded member → `201` with the expected body; a follow-up
    `RankGroupTurn` (or `GET /turn`) shows that member's `servedCount` incremented
    and the ranking reordered.
  - POST with a random non-existent `pickerId` → `422`.
  - POST with a non-UUID `pickerId`, and POST with malformed JSON → `400`.
- **Unit — pure (mobile):** `parsePick` (well-formed, missing fields, wrong types);
  `todayLocalISO` (formats an injected date correctly, zero-pads month/day).
- **Integration — real local HTTP server (mobile):** `recordPick` over real `fetch`
  against a local server returning `201` with a pick payload.
- **Manual:** `just db-up && just migrate && just seed && just run`; `curl -X POST`
  `/groups/<id>/picks` with a valid body (and an unknown picker → 422); launch the
  Expo app, tap a member, confirm the standings reorder.

## Shared contract

The seeded group UUID `11111111-1111-1111-1111-111111111111` ("Friday Film Club")
remains shared across the backend seed, the mobile app, and the integration tests.

## Risks & notes

- **No uniqueness constraint** means double-submits double-count; mitigated by the
  mobile in-flight lock and accepted for the skeleton (see Key decisions).
- FK-violation detection depends on the pgx `*pgconn.PgError` type and `SQLSTATE`
  `23503`; the integration test exercises the unknown-picker → 422 path so this
  stays honest.
- testcontainers-go needs a container runtime present when tests run (rootless
  Podman on this machine, via `DOCKER_HOST`).
- Recording a pick is a runtime write — no new seed data is required; the existing
  turn-slice seed provides the starting standings to move.
</content>
</invoke>
