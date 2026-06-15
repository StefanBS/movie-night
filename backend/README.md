# Movie Night — Backend

Go HTTP API over PostgreSQL. Serves the group roster and "whose turn" ranking,
handles membership churn (join / deactivate / reactivate / promote), runs the
per-night lifecycle (create, attendees, pick), and proxies movie search/attach
through [TMDB](https://www.themoviedb.org).

## Stack

- **Go 1.26** — HTTP server (standard library `net/http`, method-pattern routing)
- **PostgreSQL 18** — data store (UUIDv7 primary keys)
- **[pgx](https://github.com/jackc/pgx)** — Postgres driver + connection pool
- **[sqlc](https://sqlc.dev)** — type-safe Go from SQL queries
- **[goose](https://github.com/pressly/goose)** — database migrations
- **[TMDB](https://developer.themoviedb.org)** — upstream movie metadata (proxied)
- **[testcontainers](https://golang.testcontainers.org)** — real-Postgres integration tests
- **[just](https://github.com/casey/just)** — command runner ([`justfile`](justfile))

## Prerequisites

- **Go 1.26+**
- **[just](https://github.com/casey/just)**
- **A container runtime** — Docker or rootless Podman — for the dev database and
  integration tests. Podman routes through `DOCKER_HOST` (see
  [Configuration](#configuration)); Docker Desktop needs neither var.

goose and sqlc are not installed separately: they are `go.mod`
[tool dependencies](https://go.dev/doc/modules/managing-dependencies#tools) run
via `go tool`.

## Configuration

The `justfile` auto-loads a gitignored `.env`. Create it in this directory:

```dotenv
# Server / migrations / seeding connection string (matches compose.yaml).
DATABASE_URL=postgres://movie:movie@localhost:5432/movienight?sslmode=disable

# Comma-separated browser origins allowed by CORS (the deployed web origin in prod).
CORS_ALLOWED_ORIGINS=http://localhost:8081

# TMDB v4 read token for the movie proxy. Optional — when unset, /movies/search
# and movie attach return 503. https://www.themoviedb.org/settings/api
TMDB_READ_TOKEN=

# Podman only — route docker compose + testcontainers to the rootless socket.
DOCKER_HOST=unix:///run/user/1000/podman/podman.sock
TESTCONTAINERS_RYUK_DISABLED=true
```

CORS applies only to the Expo **web** target; native apps and `curl` send no
`Origin`.

## Quickstart

From this directory:

```bash
just db-up      # start PostgreSQL 18 in a container (detached)
just migrate    # apply all goose migrations
just seed       # load dev fixtures (idempotent)
just run        # start the API on http://localhost:8080
```

Verify:

```bash
curl localhost:8080/healthz
# {"status":"ok"}

# Roster for the seeded "Friday Film Club" group:
curl localhost:8080/groups/11111111-1111-1111-1111-111111111111/members
```

### Endpoints

**Roster & turn order**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Liveness — `{"status":"ok"}`. |
| `GET` | `/groups/{groupId}/members` | Active members in rotation order. |
| `GET` | `/groups/{groupId}/turn` | Active core ranked least-served ([ADR-0005](../docs/adr/0005-least-served-turn-ranking.md)); element 0 is the picker. Optional `present=<uuid>,…` filters to tonight's attendees. Returns `[{"id","name","role","servedCount","lastPickedOn"}]` (`lastPickedOn`: `YYYY-MM-DD` or `null`). |

**Membership churn** ([ADR-0006](../docs/adr/0006-membership-churn-handling.md)) — each returns the updated member `{"id","name","role","status"}`; idempotent.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/groups/{groupId}/members` | Join as active core, seeded to the current average. Body `{"name"}`. |
| `POST` | `/groups/{groupId}/members/{userId}/deactivate` | Mark inactive (leaves the rotation). |
| `POST` | `/groups/{groupId}/members/{userId}/reactivate` | Restore; re-seeds if it re-enters the rotation. |
| `POST` | `/groups/{groupId}/members/{userId}/promote` | Guest → active core. |

**Night lifecycle** — each returns the night `{"id","scheduledFor","pickerId","movie","attendees"}`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/groups/{groupId}/nights` | Start or resume the group's one open night. Body `{"scheduledFor","attendees"}`. |
| `GET` | `/groups/{groupId}/nights/current` | Latest night; `404` if none. |
| `GET` | `/groups/{groupId}/nights/{nightId}` | A night and its attendees. |
| `GET` | `/groups/{groupId}/nights/{nightId}/turn` | Least-served ranking over the night's attendees. |
| `POST` | `/groups/{groupId}/nights/{nightId}/attendees` | Mark present. Body `{"userId"}`. |
| `DELETE` | `/groups/{groupId}/nights/{nightId}/attendees/{userId}` | Remove an attendee; idempotent. |
| `POST` | `/groups/{groupId}/nights/{nightId}/pick` | Set the picker (must be an attendee; guest picks don't move standings). Body `{"pickerId"}`. |

**Movies** ([ADR-0007](../docs/adr/0007-tmdb-proxy-source-of-truth.md)) — `503` when `TMDB_READ_TOKEN` is unset.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/movies/search?q=…` | TMDB search proxy; `400` empty query, `502` upstream failure. |
| `POST` | `/groups/{groupId}/nights/{nightId}/movie` | Attach a movie by `{"tmdbId"}`; re-fetches canonical title/year from TMDB and returns the night. Repeatable. |

## Testing

```bash
just test              # fast unit tests (pure functions, no external deps)
just test-integration  # integration tests against a real Postgres
just check             # gofmt + vet + build + unit tests (the pre-commit/CI gate)
```

`just test-integration` starts a throwaway Postgres via testcontainers, runs the
migrations, and exercises the handlers end to end. Run it through `just` so the
container-runtime vars from `.env` load.

## Git hooks

[lefthook](https://lefthook.dev) (config at the repo root):

- **pre-commit** — [betterleaks](https://github.com/betterleaks/betterleaks)
  secret scan + `just fmt-check` / `just vet` on staged Go files.
- **pre-push** — `just test`.

Integration tests and the full matrix run in CI. Enable hooks once per clone:

```bash
go install github.com/evilmartians/lefthook/v2@latest   # or: brew install lefthook
sudo dnf install betterleaks   # or: brew install betterleaks (also: docker / releases page)
lefthook install               # from the repo root
```

## Database workflow

```bash
just migrate        # apply pending migrations
just migrate-down   # roll back the most recent migration
just seed           # (re)load dev seed data — safe to run repeatedly
just sqlc           # regenerate internal/db after editing SQL
just db-reset       # destroy the container AND its data volume
```

- **Migrations** — [`migrations/`](migrations) (goose). Schema:
  [`../docs/schema.dbml`](../docs/schema.dbml).
- **Queries** — `internal/db/query/`. Run `just sqlc` after edits to regenerate
  `internal/db` (marked `DO NOT EDIT` — change the SQL, not the Go).
- **Seed** — `seed.sql`, idempotent fixtures keyed on fixed UUIDs (not a
  migration). The seeded group `11111111-1111-1111-1111-111111111111` is shared
  with the mobile app and integration tests.

## Project layout

```
backend/
├── internal/db/       # sqlc-generated queries/models (DO NOT EDIT) + query/*.sql
├── migrations/        # goose SQL migrations
├── main.go            # server entrypoint, route table, withCORS, graceful shutdown
├── http.go            # shared HTTP plumbing (UUID parsing, JSON/error responses)
├── cors.go            # CORS middleware (parseAllowedOrigins, withCORS)
├── roster.go          # roster + turn handlers and response mapping
├── turn.go            # least-served ranking response mapping
├── membership.go      # join / deactivate / reactivate / promote (churn)
├── nights.go          # night lifecycle: create, attendees, pick
├── movies.go          # movie DTO + search/attach handlers (TMDB-backed)
├── tmdb.go            # TMDB client (search, fetch, poster URLs)
├── *_test.go          # table-driven unit tests (pure functions, no mocks)
├── *_integration_test.go  # testcontainers integration tests (//go:build integration)
├── seed.sql           # idempotent dev fixtures
├── compose.yaml       # PostgreSQL 18 dev container
└── justfile           # all dev commands
```

`just --list` shows every recipe.
