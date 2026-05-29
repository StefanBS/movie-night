# Movie Night — Backend

HTTP API for the Movie Night app, written in Go. It serves a group roster from
PostgreSQL.

## Stack

- **Go 1.26** — HTTP server (standard library `net/http`)
- **PostgreSQL 18** — data store (UUIDv7 primary keys)
- **[pgx](https://github.com/jackc/pgx)** — Postgres driver + connection pool
- **[sqlc](https://sqlc.dev)** — generates type-safe Go from SQL queries
- **[goose](https://github.com/pressly/goose)** — database migrations
- **[testcontainers](https://golang.testcontainers.org)** — real-Postgres integration tests
- **[just](https://github.com/casey/just)** — command runner (see the [`justfile`](justfile))

## Prerequisites

- **Go 1.26+** — `go version`
- **just** — `brew install just` / `cargo install just` / [other methods](https://github.com/casey/just#installation)
- **A container runtime** for the dev database and integration tests — either
  **Docker** or **rootless Podman**. This project is set up for Podman: the
  `docker compose` commands are routed to the Podman socket via `DOCKER_HOST`
  (see Configuration). With Docker Desktop you can omit `DOCKER_HOST`.

goose and sqlc are **not** installed separately — they're declared as
[tool dependencies](https://go.dev/doc/modules/managing-dependencies#tools) in
`go.mod` and invoked with `go tool` by the `justfile`.

## Configuration

The `justfile` auto-loads a `.env` file (`set dotenv-load`). `.env` is
gitignored — create it in this directory:

```dotenv
# Connection string used by the server, migrations, and seeding.
DATABASE_URL=postgres://movie:movie@localhost:5432/movienight?sslmode=disable

# Podman users: point docker compose + testcontainers at the rootless socket.
# Omit these two lines if you use Docker Desktop.
DOCKER_HOST=unix:///run/user/1000/podman/podman.sock
TESTCONTAINERS_RYUK_DISABLED=true
```

`DATABASE_URL` matches the credentials and port in [`compose.yaml`](compose.yaml).

## Quickstart

From this directory:

```bash
just db-up      # start PostgreSQL 18 in a container (detached)
just migrate    # apply all goose migrations
just seed       # load dev fixtures (idempotent)
just run        # start the API on http://localhost:8080
```

Verify it's up:

```bash
curl localhost:8080/healthz
# {"status":"ok"}

# Roster for the seeded "Friday Film Club" group:
curl localhost:8080/groups/11111111-1111-1111-1111-111111111111/members
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Liveness check — returns `{"status":"ok"}` |
| `GET` | `/groups/{groupId}/members` | Active members of a group, in rotation order |

## Testing

```bash
just test              # fast unit tests (pure functions, no external deps)
just test-integration  # integration tests against a real Postgres
```

`just test-integration` spins up a throwaway PostgreSQL container via
testcontainers, runs the goose migrations against it, and exercises the HTTP
handler end to end. It needs a working container runtime and the `DOCKER_HOST`
/ `TESTCONTAINERS_RYUK_DISABLED` values from `.env` — running it through `just`
(rather than `go test` directly) ensures those are loaded.

## Database workflow

```bash
just migrate        # apply pending migrations
just migrate-down   # roll back the most recent migration
just seed           # (re)load dev seed data — safe to run repeatedly
just sqlc           # regenerate internal/db after editing SQL
just db-reset       # destroy the container AND its data volume
```

- **Migrations** live in [`migrations/`](migrations) (goose format). The schema
  is documented in [`../docs/schema.dbml`](../docs/schema.dbml).
- **Queries** live in `internal/db/query/`. After editing them (or the schema),
  run `just sqlc` to regenerate the type-safe `internal/db` package.
  Generated files are marked `DO NOT EDIT` — change the SQL, not the Go.
- **Seed data** (`seed.sql`) is **not** a migration; it's idempotent dev
  fixtures keyed on fixed UUIDs. The seeded group
  `11111111-1111-1111-1111-111111111111` is shared with the mobile app and the
  integration test.

## Project layout

```
backend/
├── main.go                      # server entrypoint, routing, graceful shutdown
├── roster.go                    # roster handler + response mapping
├── roster_test.go               # unit tests
├── roster_integration_test.go   # testcontainers integration test (//go:build integration)
├── migrations/                  # goose SQL migrations
├── internal/db/                 # sqlc-generated queries/models (DO NOT EDIT)
├── seed.sql                     # idempotent dev fixtures
├── compose.yaml                 # PostgreSQL 18 dev container
└── justfile                     # all dev commands
```

Run `just` (or `just --list`) to see every available recipe.
