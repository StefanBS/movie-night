# Movie Night — Backend

HTTP API for the Movie Night app, written in Go over PostgreSQL. It serves the
group roster and "whose turn is it" ranking, handles membership churn
(join / deactivate / reactivate / promote), runs the per-night lifecycle
(create the night, track attendees, record the pick), and proxies movie search /
attach through [TMDB](https://www.themoviedb.org) so the API token stays
server-side.

## Stack

- **Go 1.26** — HTTP server (standard library `net/http`, method-pattern routing)
- **PostgreSQL 18** — data store (UUIDv7 primary keys)
- **[pgx](https://github.com/jackc/pgx)** — Postgres driver + connection pool
- **[sqlc](https://sqlc.dev)** — generates type-safe Go from SQL queries
- **[goose](https://github.com/pressly/goose)** — database migrations
- **[TMDB](https://developer.themoviedb.org)** — upstream movie metadata (proxied)
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

# Comma-separated web origins allowed to call the API from a browser (CORS).
# In prod, set this to your deployed web origin (e.g. https://movie-night.app).
CORS_ALLOWED_ORIGINS=http://localhost:8081

# TMDB v4 read-access token for the movie search/attach proxy. Optional: when
# unset, the server still starts but /movies/search and the attach endpoint
# return 503. Get one at https://www.themoviedb.org/settings/api.
TMDB_READ_TOKEN=

# Podman users: point docker compose + testcontainers at the rootless socket.
# Omit these two lines if you use Docker Desktop.
DOCKER_HOST=unix:///run/user/1000/podman/podman.sock
TESTCONTAINERS_RYUK_DISABLED=true
```

`DATABASE_URL` matches the credentials and port in [`compose.yaml`](compose.yaml).
Browsers enforce CORS, so the Expo **web** target needs its origin in
`CORS_ALLOWED_ORIGINS`; the iOS/Android apps and `curl` send no `Origin` and are
unaffected.

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

**Roster & turn order**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Liveness check — returns `{"status":"ok"}` |
| `GET` | `/groups/{groupId}/members` | Active members of a group, in rotation order |
| `GET` | `/groups/{groupId}/turn` | Active core members ranked by [ADR-0005](../docs/adr/0005-least-served-turn-ranking.md)'s least-served order; element 0 is tonight's picker. Optional `present=<uuid>,<uuid>` query param filters to members present tonight; omitted/empty ranks all active core. Returns `[{"id","name","role","servedCount","lastPickedOn"}]` where `lastPickedOn` is `YYYY-MM-DD` or `null`; `400` on invalid UUIDs. |

**Membership churn** ([ADR-0006](../docs/adr/0006-membership-churn-handling.md)) — each returns the updated member `{"id","name","role","status"}` and is idempotent.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/groups/{groupId}/members` | Join: a new person enters the rotation as active core, seeded to the current average served-count. Body `{"name"}`; `201`. |
| `POST` | `/groups/{groupId}/members/{userId}/deactivate` | Mark a member inactive (drops out of the rotation). |
| `POST` | `/groups/{groupId}/members/{userId}/reactivate` | Bring a member back; re-seeds to the average if it re-enters the rotation. |
| `POST` | `/groups/{groupId}/members/{userId}/promote` | Promote a guest to active core and seed into the rotation. |

**Night lifecycle** — create/attendee/pick/movie all return the night `{"id","scheduledFor","pickerId","movie","attendees"}`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/groups/{groupId}/nights` | Start (or resume) the group's one open night. Body `{"scheduledFor","attendees"}`; `201` created / `200` resumed. |
| `GET` | `/groups/{groupId}/nights/current` | The group's latest night, so the app resumes across sessions; `404` if none. |
| `GET` | `/groups/{groupId}/nights/{nightId}` | A specific night and its attendees. |
| `GET` | `/groups/{groupId}/nights/{nightId}/turn` | Least-served ranking over *this night's attendees* (element 0 = whose turn). |
| `POST` | `/groups/{groupId}/nights/{nightId}/attendees` | Mark a member present. Body `{"userId"}`; `201`. |
| `DELETE` | `/groups/{groupId}/nights/{nightId}/attendees/{userId}` | Remove an attendee (idempotent). |
| `POST` | `/groups/{groupId}/nights/{nightId}/pick` | Record/change the picker (must be an attendee; a guest pick never moves standings). Body `{"pickerId"}`. |

**Movies** ([ADR-0007](../docs/adr/0007-tmdb-proxy-source-of-truth.md)) — both `503` when `TMDB_READ_TOKEN` is unset.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/movies/search?q=…` | Thin TMDB search proxy (keeps the token server-side); `400` empty query, `502` upstream failure. |
| `POST` | `/groups/{groupId}/nights/{nightId}/movie` | Attach a movie to the night by `{"tmdbId"}`; the server re-fetches canonical title/year from TMDB, caches it, and returns the updated night. Repeatable (the correction path). |

## Testing

```bash
just test              # fast unit tests (pure functions, no external deps)
just test-integration  # integration tests against a real Postgres
just check             # gofmt + vet + build + unit tests (the pre-commit/CI gate)
```

`just test-integration` spins up a throwaway PostgreSQL container via
testcontainers, runs the goose migrations against it, and exercises the HTTP
handler end to end. It needs a working container runtime and the `DOCKER_HOST`
/ `TESTCONTAINERS_RYUK_DISABLED` values from `.env` — running it through `just`
(rather than `go test` directly) ensures those are loaded.

## Git hooks

This repo uses [lefthook](https://lefthook.dev) (config at the repo root):

- **pre-commit** — secret scan ([betterleaks](https://github.com/betterleaks/betterleaks))
  plus, for the backend, `just fmt-check` and `just vet` on staged Go files.
- **pre-push** — `just test` (unit tests) before code leaves your machine.

Integration tests and the full matrix run in CI. Enable the hooks once per clone:

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
├── migrations/        # goose SQL migrations
├── internal/db/       # sqlc-generated queries/models (DO NOT EDIT) + query/*.sql
├── seed.sql           # idempotent dev fixtures
├── compose.yaml       # PostgreSQL 18 dev container
└── justfile           # all dev commands
```

Run `just` (or `just --list`) to see every available recipe.
