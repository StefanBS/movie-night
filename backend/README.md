# Movie Night — Backend

Go HTTP API over PostgreSQL. Serves the group roster and "whose turn" ranking,
handles membership churn (join / deactivate / reactivate / promote), runs the
per-night lifecycle (create, edit, pick), proxies movie search/attach
through [TMDB](https://www.themoviedb.org), and sends push reminders before
each night.

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

# TMDB v4 read token for the movie proxy. Optional — when unset, movie search
# and movie attach return 503. https://www.themoviedb.org/settings/api
TMDB_READ_TOKEN=

# Expo access token for sending reminders (ADR-0010). Optional — only needed
# once push security is enabled for the project in EAS. Reminders go out from
# the API process every minute either way.
EXPO_ACCESS_TOKEN=

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

**Group, roster & turn order**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Liveness — `{"status":"ok"}`. |
| `GET` | `/groups/{groupId}` | The group `{"name","createdOn"}` (`createdOn`: `YYYY-MM-DD`). |
| `PATCH` | `/groups/{groupId}` | Rename the group. Body `{"name"}`; `400` if blank. Returns the group. |
| `GET` | `/groups/{groupId}/members` | Active members in rotation order. |
| `GET` | `/groups/{groupId}/turn` | Active core ranked least-served ([ADR-0005](../docs/adr/0005-least-served-turn-ranking.md)); element 0 is the picker. Returns `[{"id","name","role","servedCount","lastPickedOn"}]` (`lastPickedOn`: `YYYY-MM-DD` or `null`). |

**Membership churn** ([ADR-0006](../docs/adr/0006-membership-churn-handling.md)) — each returns the updated member `{"id","name","role","status"}`; idempotent.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/groups/{groupId}/members` | Join as an active member. Body `{"name","role"}`, both required; `role` is `"core"` (enters the rotation seeded to the current average) or `"guest"`. |
| `POST` | `/groups/{groupId}/members/{userId}/deactivate` | Mark inactive (leaves the rotation). |
| `POST` | `/groups/{groupId}/members/{userId}/reactivate` | Restore; re-seeds if it re-enters the rotation. |
| `POST` | `/groups/{groupId}/members/{userId}/promote` | Active guest → active core. `409` for an inactive member (reactivate first). |

**Identity** ([ADR-0009](../docs/adr/0009-claimed-identity-device-tokens.md)) — the person an install acts as. Every route but the claim takes `Authorization: Bearer <token>` and return `401` without a valid one; the other routes are unauthenticated.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/identity` | Claim an active member (core or guest); `201` `{"token","identity":{"id","name","remindersMuted"}}`. Body `{"groupId","userId"}`; `404` if not a member, `422` if inactive. |
| `GET` | `/identity` | The bearer's identity `{"id","name","remindersMuted"}`. |
| `DELETE` | `/identity` | Release the identity, revoking the token; `204`. Idempotent. |
| `PUT` | `/identity/push` | Register this device for reminders ([ADR-0010](../docs/adr/0010-server-push-reminders.md)); `204`. Body `{"pushToken","timeZone"}`: an Expo push token and an IANA zone; `400` if either is invalid. The push token is taken off any other device. |
| `PUT` | `/identity/preferences` | Mute or unmute every reminder to this person, on all their devices. Body `{"remindersMuted"}`; returns the identity. |

**Night lifecycle** ([ADR-0008](../docs/adr/0008-night-always-has-a-picker.md)) — each returns the night `{"id","scheduledFor","startTime","pickerId","movie","attendees","reminders","watchedAt","repeat"}`, where `watchedAt` is when the group recorded it as watched (RFC 3339, UTC) or `null` while it is still planned ([ADR-0012](../docs/adr/0012-night-recorded-as-watched.md)), `startTime` is a zone-less `HH:MM` or `null` ([ADR-0011](../docs/adr/0011-night-start-time-wall-clock.md)) and `reminders` is `{"nightBefore","morningOf","twoHoursBefore","audience"}` with audience `everyone` or `picker` ([ADR-0010](../docs/adr/0010-server-push-reminders.md)); `twoHoursBefore` only fires on a night with a start time. `repeat` is `null` for a one-off, `{"freq":"weekly","intervalWeeks":1|2}`, or `{"freq":"monthly","week":1–4|-1}` (the Nth, or last, of the night's weekday; it must match `scheduledFor`, else `400`); recording a repeating night as watched, or cancelling it, opens the next night in the series ([ADR-0014](../docs/adr/0014-repeating-nights.md)). Every night has a picker, who is always an attendee; at most one night per group per date.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/groups/{groupId}/nights` | Create a night with its picker; `201`. Body `{"scheduledFor","startTime"?,"attendees","pickerId","repeat"?}` (`startTime` `HH:MM`, omitted or `null` for none; `repeat` omitted or `null` for a one-off); `422` if the picker isn't an attendee, `409` if the date is taken. |
| `GET` | `/groups/{groupId}/nights` | Every night, past and upcoming, newest first. |
| `GET` | `/groups/{groupId}/nights/{nightId}` | A night and its attendees. |
| `PATCH` | `/groups/{groupId}/nights/{nightId}` | Replace the whole editable Night (date, start time, attendee set, reminder settings) in one transaction — a rejected edit changes nothing. Body `{"scheduledFor","startTime","attendees","reminders","repeat"}` (`startTime` `null` for none, `repeat` `null` to end the series), plus optional `"pickerId"` (change the picker in the same edit; a guest's pick doesn't move standings) and `"watched": true` (record the Night as watched; the first `watchedAt` is kept, ADR-0012; on a repeating Night it also opens the next one, ADR-0014); `422` if the attendees leave out the picker or include a non-member, or `watched` is sent for a Night with no film, or the Night is (or would become) a Watched Night dated more than a day past the server's UTC date ([ADR-0013](../docs/adr/0013-watched-night-date-bound.md)), or a Watched Night is given a repeat, `409` if the date is taken. |
| `DELETE` | `/groups/{groupId}/nights/{nightId}` | Cancel/delete the night; `204`. Idempotent. Cancelling a repeating night opens the next one in its series ([ADR-0014](../docs/adr/0014-repeating-nights.md)). |
| `GET` | `/groups/{groupId}/nights/{nightId}/turn` | Least-served ranking of active core, ignoring the night's own pick — the order its picker is chosen from. Not limited to the stored attendees: the app filters it to who came. |

**Movies** ([ADR-0007](../docs/adr/0007-tmdb-proxy-source-of-truth.md)) — `503` when `TMDB_READ_TOKEN` is unset.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/groups/{groupId}/movies/search?q=…&exceptNight=…` | TMDB search proxy; each result adds `watchedOn`, the date of the group's latest Watched Night with that film, or `null`. `exceptNight` (optional) leaves out the Night whose film is being chosen. `400` empty query or bad id, `502` upstream failure. |
| `POST` | `/groups/{groupId}/nights/{nightId}/movie` | Attach a movie by `{"tmdbId"}`; re-fetches canonical title/year from TMDB and returns the night. Repeatable, including on a Watched Night (changes its film). |
| `DELETE` | `/groups/{groupId}/nights/{nightId}/movie` | Detach the film; returns the night with `movie` null. Idempotent. `422` on a Watched Night, which keeps its film. |

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
  `internal/db` (marked `DO NOT EDIT` — change the SQL, not the Go). A full
  Night is read only through the `full_nights` view (`nights` + its movie), so a
  new Night column goes into that view, not into individual queries; writes go
  to `nights` and return at most the id.
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
├── group.go           # group read + rename
├── roster.go          # roster + turn handlers
├── turn.go            # least-served ranking response mapping
├── membership.go      # join / deactivate / reactivate / promote (churn)
├── identity.go        # claimed identity, bearer tokens, push registration
├── nights.go          # night lifecycle handlers: create, read, edit, delete
├── night_writes.go    # Night writes (create, edit, cancel, film), each in one transaction
├── tx.go              # withTx — one transaction for a multi-statement write
├── movies.go          # movie search/attach handlers (TMDB-backed)
├── tmdb.go            # TMDB client
├── reminders.go       # once-a-minute reminder loop + Expo push sender
├── *_test.go          # table-driven unit tests (pure functions, no mocks)
├── *_integration_test.go  # testcontainers integration tests (//go:build integration)
├── seed.sql           # idempotent dev fixtures
├── compose.yaml       # PostgreSQL 18 dev container
└── justfile           # all dev commands
```

`just --list` shows every recipe.
