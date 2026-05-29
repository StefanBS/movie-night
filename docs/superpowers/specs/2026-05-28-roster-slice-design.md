# Roster Walking Skeleton — Design

**Status:** Proposed · **Date:** 2026-05-28 · **Branch:** `roster-walking-skeleton`

## Goal & context

The first vertical slice of the movie-night app: a thin thread through every
layer (Postgres → Go → Expo) that proves the end-to-end wiring works and stands
up the project's foundational tooling. It is deliberately **read-only** — display
a group's roster — so the focus is the plumbing, not domain logic.

Follows ADR-0002 (build in vertical slices) and the "build as we go" principle:
we create only the schema, packages, and infrastructure this slice needs, and add
more as later slices demand it.

Authentication is deferred (it is an open backlog decision and touches the
schema). This slice uses a hardcoded/seeded group so the wiring can be proven
without committing to an auth design prematurely.

## Scope

**In:**
- Schema migration for the subset this slice needs: the `membership_role` and
  `membership_status` enums, and the `users`, `groups`, `memberships` tables
  (with the indexes from `docs/schema.dbml`).
- A dev seed: one group + ~5 active core members.
- Go: a `pgxpool` connection, an sqlc-generated `ListGroupMembers` query, and one
  HTTP handler `GET /groups/{groupId}/members`.
- Expo: a single screen that fetches and lists the roster.
- One testcontainers-go integration test (migrate → seed → query → assert order).
- Dev infrastructure: `compose.yaml` (postgres:17), goose migration setup, sqlc
  config, and a `justfile` with the common targets.

**Out (deferred to later slices):**
- Any writes (no add/edit/remove member).
- Auth / accounts.
- Movies, picks, attendances, reviews, watchlists, and the turn-ranking logic.
- The remaining `schema.dbml` tables.
- Navigation or state-management libraries in the app (one screen, local state).

## Resolved tooling decisions

- **Data access:** sqlc (type-safe codegen) over pgx v5 (`pgxpool`). We write SQL;
  sqlc generates type-safe Go. Keeps us fluent in SQL and catches schema/struct
  mismatches at compile time.
- **Migrations:** goose. Wraps each migration in a transaction (Postgres has
  transactional DDL), so a failed migration rolls back cleanly instead of leaving
  a "dirty" state — gentler for a learning project, and a clean path to Go-based
  data migrations later (e.g. ADR-0006 baseline seeding, ADR-0003 CSV import).
- **Postgres runtime:** Compose (Podman or Docker), `postgres:17` + a named volume.
- **Testing:** testcontainers-go — an ephemeral Postgres per test run; self-
  contained and CI-friendly. No DB mocks (they would hide exactly the schema/query
  bugs we want to catch).
- **Task runner:** `just` (a `justfile`) — a purpose-built command runner, cleaner
  than Make and self-documenting via `just --list`. It is thin sugar over
  `go tool`, `docker compose`, and `go test`.
- **Tool versioning:** `sqlc` and `goose` are pinned as Go tool dependencies in
  `go.mod` (Go 1.24+ `tool` directive), invoked as `go tool sqlc` / `go tool goose`.
  This makes their versions reproducible without a separate install step or the
  old `tools.go` hack.

## Architecture & components

Backend layout grows only as needed:

```
backend/
  main.go                # config + pgxpool + route registration + handler
  compose.yaml           # postgres:17 service + volume
  sqlc.yaml              # schema = migrations/, queries = internal/db/query/
  justfile               # db-up, migrate, seed, sqlc, test, run (sugar over `go tool` etc.)
  migrations/
    0001_init.sql        # goose: enums + users, groups, memberships (+ indexes)
  seed.sql               # dev-only: 1 group + ~5 members (NOT a migration)
  internal/
    db/                  # sqlc OUTPUT: db.go, models.go, roster.sql.go
      query/
        roster.sql       # the ListGroupMembers query (sqlc INPUT)
mobile/                  # create-expo-app (TypeScript): one roster screen
```

The `internal/db` package materializes now because it holds real (generated) code.
The HTTP handler stays in `main.go` for this slice; we split out `internal/handlers`
only when a second endpoint justifies it.

**Components & responsibilities:**
- `internal/db` (generated) — the only thing that talks SQL. Input: a `pgxpool`
  and a group id. Output: typed member rows. Independently testable.
- `main.go` — reads `DATABASE_URL`, opens the pool, registers the route, and wires
  the handler with the concrete sqlc `*Queries`. The handler's pure pieces — path
  UUID validation and the row → JSON mapping — are extracted as standalone functions
  so they can be unit-tested directly, with no test doubles. No business logic.
- Expo screen — fetches the endpoint, renders a `FlatList`, handles loading/error/
  empty states.

## Data flow

Screen mounts → `fetch(${EXPO_PUBLIC_API_URL}/groups/{id}/members)` → Go handler →
`db.New(pool).ListGroupMembers(ctx, groupID)` → SQL joins `memberships`↔`users`,
filters to active members, orders by `rotation_position` → handler serializes to
JSON → `FlatList` renders name + role.

## API contract

`GET /groups/{groupId}/members`
- **200** — JSON array, ordered by `rotation_position` then `name`:
  `[{"id": "<uuid>", "name": "<string>", "role": "core" | "guest"}]`.
  Empty array if the group has no active members. A valid UUID that matches no
  group also returns `200` + empty array — this slice does not check group
  existence (deferred until there is a real groups read-path).
- **400** — `groupId` is not a valid UUID.
- **500** — database error (logged server-side; generic message to client).

## Schema (migration 0001)

A subset of `docs/schema.dbml`, verbatim in shape:
- Enums `membership_role` (`core`, `guest`) and `membership_status`
  (`active`, `inactive`).
- `users` (id, name, letterboxd_user, created_at).
- `groups` (id, name, created_at).
- `memberships` (id, group_id, user_id, role, status, baseline_picks,
  rotation_position, joined_at, left_at) with the unique index
  `uq_membership_group_user` and `ix_membership_active_core`.
- UUID PKs default to `gen_random_uuid()` (built into Postgres 13+).
- Foreign keys per `schema.dbml`: memberships → groups/users (cascade).

## Seeding

`seed.sql`, applied via `just seed` after migrations and kept out of the migration
sequence so it is unmistakably dev-only. One group, ~5 users, and a `core`/`active`
membership each with `rotation_position` 1..5 and `baseline_picks` 0. Uses fixed
UUIDs + `ON CONFLICT DO NOTHING` so it is safe to re-run.

## Error handling

- **Backend:** validate the path UUID (→ 400); DB errors → 500 + server log; no
  panics in the request path. Pool created at startup; failure to connect aborts
  startup with a clear log line.
- **Mobile:** explicit loading, error (fetch failed / non-200), and empty states.

## Testing

Two automated layers (a test pyramid), plus a manual smoke check. **Unit tests are
pure — no mocks, fakes, stubs, or other test doubles.** Anything that needs a
database is covered by the integration test against real Postgres, never by
simulating the DB.

- **Unit — pure, table-driven, no DB and no doubles.** Test the handler's extracted
  pure functions directly: (1) path UUID validation — valid / malformed / empty
  strings → expected ok/err; (2) row → response mapping — given sqlc rows, produce
  the expected JSON DTOs with correct fields and preserved ordering. Idiomatic Go
  table-driven style: a slice of named cases run through `t.Run` subtests.
- **Integration — real Postgres via testcontainers-go.** Start `postgres:17`, run
  goose migrations, insert known fixtures, then exercise the full path — the handler
  wired to the real `*Queries`, driven through `httptest` — and assert `200` with
  the seeded members in `rotation_position` order plus the empty-group case. This is
  where the query, JSON wiring, and status codes are verified end to end. Build-
  tagged so it is separable from the fast unit tests.
- **Manual:** `just db-up && just migrate && just seed && just run`, `curl` the
  endpoint, then launch the Expo app and confirm the roster renders.

## Thread 1 — git hygiene (already done on this branch)

Untracked the committed `backend/backend` build artifact and added a root
`.gitignore`. Committed as `chore: add .gitignore and stop tracking compiled binary`.

## Risks & notes

- Expo Go on a **physical phone** cannot reach `localhost` (that is the phone).
  The API base URL is a configurable `EXPO_PUBLIC_API_URL` pointing at the dev
  machine's LAN IP; simulator/web can use `localhost`.
- testcontainers-go needs a container runtime present when tests run (Podman or
  Docker — available, same as the Compose decision).
- `gen_random_uuid()` is core in Postgres 13+, so no `pgcrypto` extension is needed
  on `postgres:17`.
