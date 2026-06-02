# Turn Ranking — Design

**Status:** Proposed · **Date:** 2026-06-02 · **Branch:** `turn-ranking`

## Goal & context

The second vertical slice of the movie-night app. The roster slice proved the
Postgres → Go → Expo wiring with a read-only roster; this slice adds the app's
core domain question from [ADR-0005](../../adr/0005-least-served-turn-ranking.md):
**whose turn is it tonight?**

It stays a read-only thread — seed pick history → a SQL "least-served" ranking →
an endpoint that returns the ranked roster → a mobile screen that highlights
tonight's picker. It follows the same "build as we go" and "seed-and-defer-writes"
discipline as the roster slice: we add only the schema, query, and infrastructure
this slice needs.

Presence (who is actually here tonight) is modelled as a **request input** rather
than a stored `attendances` table — the backend fully supports filtering to a
present set, but persisting attendance waits for a write path. Writes, auth,
movie metadata, and the `attendances` table are all deferred.

## Scope

**In:**
- Schema migration `0002`: a `picks` table — the subset this slice needs (no
  `movie_id` yet; see below) — with the two indexes from `docs/schema.dbml`.
- A dev seed of pick history for the existing Friday Film Club group, producing an
  unambiguous ranking (varied credited-pick counts, varied recency, and one
  never-picked member).
- Go: one sqlc-generated `RankGroupTurn` query and one HTTP handler
  `GET /groups/{groupId}/turn`.
- Expo: the existing single screen, augmented to render the ranked roster with
  tonight's picker highlighted.
- Unit tests (pure, table-driven) and an integration test (testcontainers) on the
  backend; unit + real-server integration tests on mobile.

**Out (deferred to later slices):**
- The `movie_id` column on `picks` and the `movies` table — arrive with the TMDB
  metadata slice.
- The `attendances` table — presence is a request input here.
- Any writes (recording a pick, recording attendance).
- Auth / accounts.
- A navigation library or a presence-picker UI on mobile.

## Design decision — rank in SQL

The ranking is computed in **one sqlc query** (ADR-0005: "the turn logic reduces to
a single ranking query"), matching the roster slice's precedent of doing ordering
in SQL and verifying it with the integration test.

The decision considered ranking in Go instead (SQL aggregates raw counts; a pure Go
comparator orders), which would make the ordering rule unit-testable with no DB.
It was rejected for this slice because:

- The only logic that would move to Go is the flat 3-key `ORDER BY`; the aggregation
  (`baseline_picks + credited count`, `MAX(scheduled_for)`) must be SQL either way.
- The bug-prone parts of that ordering — "least recently picked" and "never-picked
  first" — are expressed *most safely and declaratively* in SQL as
  `last_picked_on ASC NULLS FIRST`. A hand-rolled Go comparator re-introduces fiddly
  nil-handling, so moving it to Go is close to a wash on correctness while costing
  cohesion (the rule split across two layers).
- Performance is a non-factor: a group is single-digit-to-dozens of members.

The pure-unit-test value the project prizes is still honoured where it has the most
leverage — the genuinely pure pieces (`present`-list parsing, row → DTO mapping) —
without manufacturing a Go comparator just to have something to unit-test.

**Revisit if the rule grows.** If the ranking later gains branches — a
no-back-to-back guard (noted in ADR-0005), weighting, or per-round vs lifetime
fairness toggles — it stops being a declarative 3-key sort and becomes real logic
that wants fast, exhaustive unit tests. At that point, move the ordering into a pure
Go function.

## Schema — migration `0002`

A subset of `docs/schema.dbml`, verbatim in shape minus the deferred `movie_id`:

```sql
picks (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  group_id      uuid        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  picker_id     uuid            NULL REFERENCES users(id)  ON DELETE SET NULL,
  is_credited   boolean     NOT NULL DEFAULT true,
  scheduled_for date        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
)
-- ix_pick_group_date       (group_id, scheduled_for)
-- ix_pick_picker_credited  (picker_id, is_credited)
```

- `picker_id` is nullable: `NULL` is a free pick / nobody-owed-present night
  (ADR-0005). `ON DELETE SET NULL` preserves the historical night if a user row is
  ever removed (in practice members deactivate, they are not deleted — ADR-0006).
- `is_credited` defaults `true`; guest/free picks are stored `false` so they never
  move standings (ADR-0006).
- `movie_id` (NOT NULL in `schema.dbml`) is deferred to the movies slice — the
  ranking does not need it, and the `movies` table does not exist yet. A pick here
  records *who picked and when*, which is all the ranking requires.
- PK default is `uuidv7()` to match the existing `0001` migration (not
  `gen_random_uuid()`).
- Goose `Up`/`Down` like `0001` (transactional DDL; `Down` drops the table).

## The ranking query (sqlc — `internal/db/query/turn.sql`)

```sql
-- name: RankGroupTurn :many
SELECT u.id, u.name, m.role,
       m.baseline_picks + COALESCE(p.credited_count, 0)::int AS served_count,
       p.last_picked_on
FROM memberships m
JOIN users u ON u.id = m.user_id
LEFT JOIN (
  SELECT picker_id,
         COUNT(*) FILTER (WHERE is_credited)           AS credited_count,
         MAX(scheduled_for) FILTER (WHERE is_credited) AS last_picked_on
  FROM picks
  WHERE group_id = $1
  GROUP BY picker_id
) p ON p.picker_id = m.user_id
WHERE m.group_id = $1
  AND m.status = 'active'
  AND m.role = 'core'
  AND ($2::uuid[] IS NULL OR u.id = ANY($2::uuid[]))
ORDER BY served_count ASC, last_picked_on ASC NULLS FIRST, m.rotation_position ASC;
```

- `served_count` = `baseline_picks` (ADR-0006 churn seeding) + the member's credited
  pick count. The `LEFT JOIN` + `COALESCE` makes a never-picked member count `0`.
- `last_picked_on` is the member's most recent **credited** pick; `NULL` for a member
  who has never had a credited pick.
- `$2` is the present-set. The handler passes `nil` when `present` is absent →
  `NULL` → no filter (all active core). A non-empty list filters to those present.
- Ordering realises ADR-0005: fewest credited picks first; ties broken by
  least-recently-picked (`ASC`, with never-picked `NULLS FIRST`); final tiebreak the
  stable `rotation_position` seed.

## API contract

`GET /groups/{groupId}/turn`

Optional query param `present=<uuid>,<uuid>,…` — the members present tonight.
Omitted or empty ⇒ all active core members.

- **200** — JSON array ordered by the ranking; **element 0 is tonight's picker**:
  ```json
  [{"id": "<uuid>", "name": "<string>", "role": "core" | "guest",
    "servedCount": <int>, "lastPickedOn": "YYYY-MM-DD" | null}]
  ```
  Empty array if no active core member matches (e.g. the present set excludes
  everyone). As in the roster slice, this endpoint does not check group existence — a
  valid UUID that matches no group returns `200` + `[]`.
- **400** — `groupId` is not a valid UUID, or any `present` value is not a valid UUID.
- **500** — database error (logged server-side; generic message to the client).

`servedCount` and `lastPickedOn` are returned so the UI (and a human) can see *why*
someone is up next, not just the bare order.

## Backend components

Mirrors `roster.go`'s structure. New file `turn.go`:

- Reuse `parseGroupID` for the path UUID.
- **Pure** `parsePresent(raw string) ([]uuid.UUID, error)` — splits on `,`, trims
  whitespace, validates each as a UUID; an empty/blank input returns `nil` (→ all
  core). Independently unit-testable.
- **Pure** `toTurnResponses([]db.RankGroupTurnRow) []turnResponse` — maps rows to the
  DTO, formats `scheduled_for` as `YYYY-MM-DD`, encodes a null last-pick as JSON
  `null`, preserves order, and always returns a non-nil slice so an empty result
  encodes as `[]`. Independently unit-testable.
- A minimal `turnStore` interface with the one `RankGroupTurn` method, satisfied by
  the real `*db.Queries` — so no mock is ever written (same pattern as `rosterStore`).
- Wire `mux.Handle("GET /groups/{groupId}/turn", turnHandler(queries))` in `main.go`.

`internal/db` gains the generated `turn.sql.go` from `just sqlc`; generated code is
never hand-edited.

## Data flow

Screen mounts → `fetch(${API}/groups/{id}/turn)` → Go handler → `parseGroupID` +
`parsePresent` → `store.RankGroupTurn(ctx, {groupID, present})` → SQL aggregates
credited picks per member, filters to active core (∩ present), orders least-served →
`toTurnResponses` serialises to JSON → the screen renders the ranked list with
element 0 highlighted as tonight's picker.

## Seeding (`seed.sql`)

Extend the existing dev seed with credited picks for the five Friday Film Club
members on fixed `scheduled_for` dates, chosen to produce one unambiguous order that
exercises every ranking rule:

- different credited-pick counts (the primary key),
- at least one count-tie resolved by recency (the second key),
- one **never-picked** member (NULL last-pick → top via `NULLS FIRST`).

Fixed pick UUIDs + `ON CONFLICT DO NOTHING` keep it re-runnable. The shared group
UUID `11111111-1111-1111-1111-111111111111` is unchanged.

## Mobile

Augment the single existing screen — no navigation library (deferred until a third
screen justifies one).

- New `lib/turn.ts`: `fetchTurn` + payload validation, mirroring `lib/members.ts`
  and reusing `lib/api.ts` for backend-URL resolution.
- `App.tsx` renders the ranked list from `/turn`: element 0 gets a **"Tonight's
  pick"** badge and a served-count / last-picked subtitle; the rest render below as
  the standings. Loading, error, and empty states as in the roster screen.
- No presence-picker UI yet (defaults to all active core); selecting who is present
  lands with the attendance slice.
- The turn payload is a superset of the roster, so the screen no longer calls
  `/members`. `lib/members.ts` and the backend `/members` endpoint stay unchanged and
  still tested; an unused mobile roster fetch can be retired later rather than churned
  now.

## Error handling

- **Backend:** validate the path UUID and each `present` value (→ 400); DB errors →
  500 + server log; no panics in the request path.
- **Mobile:** explicit loading, error (fetch failed / non-200 / invalid payload), and
  empty states.

## Testing

Two automated layers plus a manual smoke check. **Unit tests are pure — no mocks,
fakes, or stubs.** Anything needing a database is covered by the integration test
against real Postgres.

- **Unit — pure, table-driven (backend):**
  - `parsePresent` — empty/blank → `nil`; single and multiple valid UUIDs;
    whitespace around values; a malformed value → error; duplicates preserved.
  - `toTurnResponses` — order preserved; null `last_picked_on` → JSON `null`; date
    formatting; empty rows → `[]` (non-nil).
- **Unit — pure (mobile):** turn-payload validation in `lib/turn.ts` (well-formed,
  missing fields, wrong types, null `lastPickedOn`).
- **Integration — real Postgres via testcontainers (backend):** migrate → seed →
  drive `turnHandler` through `httptest`, asserting the ranked order for
  (a) default all-core, (b) a present subset, and (c) a present subset that excludes
  everyone → `[]`.
- **Integration — real local HTTP server (mobile):** `fetchTurn` over real `fetch`
  against a local server returning a ranked payload.
- **Manual:** `just db-up && just migrate && just seed && just run`; `curl` `/turn`
  with and without `?present=`; launch the Expo app and confirm the highlighted
  picker.

## Shared contract

The seeded group UUID `11111111-1111-1111-1111-111111111111` ("Friday Film Club")
remains shared across the backend seed, the mobile app, and the integration tests.

## Risks & notes

- `MAX(... ) FILTER (WHERE is_credited)` and the `LEFT JOIN`/`COALESCE` are the
  subtle parts of the query; the integration-test fixtures are chosen specifically to
  cover never-picked, count-tie, and full-tie cases.
- testcontainers-go needs a container runtime present when tests run (rootless Podman
  on this machine, via `DOCKER_HOST`).
- Deferring `movie_id` means the movies slice's migration adds it (NOT NULL) and must
  backfill or run before any real pick rows exist.
