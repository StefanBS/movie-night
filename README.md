# Movie Night

A turn-based movie-night app for a small, recurring group of friends. It answers
one question first — **whose turn is it to pick tonight?** — by ranking the group
on a "least-served" basis, then helps run the evening: track who showed up,
attach the chosen movie (via [TMDB](https://www.themoviedb.org)), and record the
pick so the rotation stays fair over time.

It also handles the messy real-world bits: members join, drop out, come back, or
get promoted from guest to core, and the ranking re-seeds so nobody jumps the
queue or gets stuck at the back ([ADR-0006](docs/adr/0006-membership-churn-handling.md)).

## Repository shape

A monorepo with two independent components, each with its own toolchain,
`justfile`, README, and tests:

| Component | Stack | What it is |
|-----------|-------|------------|
| [**`backend/`**](backend/README.md) | Go 1.26 · PostgreSQL 18 | HTTP API: roster, turn ranking, membership churn, night lifecycle, TMDB proxy. |
| [**`mobile/`**](mobile/README.md) | Expo SDK 56 · React Native | The app: "Whose turn?", "Manage members", and "Tonight" screens. |

The mobile app talks to the backend over HTTP; the seeded group UUID
`11111111-1111-1111-1111-111111111111` ("Friday Film Club") is shared across the
backend seed, the mobile app, and the backend integration tests.

## Quickstart

Bring the two halves up in separate terminals. See each component's README for
prerequisites (Go + a container runtime; Node 22 + an Expo Go target) and full
configuration.

```bash
# 1. Backend — Postgres + API on :8080
cd backend
just db-up && just migrate && just seed && just run

# 2. Mobile — Metro bundler; press i/a/w or scan the QR with Expo Go
cd mobile
npm install && just start
```

## Documentation

- **[`docs/adr/`](docs/adr/README.md)** — Architecture Decision Records: why a
  dedicated app, the Go/Postgres/Expo/TMDB stack, the least-served ranking, the
  people/membership model, churn handling, and the TMDB proxy. Open and deferred
  decisions live in [`docs/adr/backlog.md`](docs/adr/backlog.md).
- **[`docs/schema.dbml`](docs/schema.dbml)** — the database schema.
- **[`CLAUDE.md`](CLAUDE.md)** — repo-wide guidance (commands, architecture,
  conventions, gotchas).

## Tooling

[`just`](https://github.com/casey/just) is the single source of truth for
commands — **CI workflows and the lefthook git hooks call the same recipes you
run locally.** From either component directory:

```bash
just            # list every recipe
just check      # the format/lint + build/typecheck + unit-test gate (what CI runs)
```

Committing runs the lefthook **pre-commit** hooks (a [betterleaks](https://github.com/betterleaks/betterleaks)
secret scan plus fast checks) and pushing runs **pre-push** (unit tests). Enable
them once per clone with `lefthook install` — see either README's "Git hooks"
section for the one-time tool setup.
