# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

A monorepo with two independent components, each with its own toolchain, `justfile`, and README:

- **`backend/`** — Go HTTP API over PostgreSQL. See [`backend/README.md`](backend/README.md).
- **`mobile/`** — Expo / React Native app (the roster screen). See [`mobile/README.md`](mobile/README.md).

`just` is the single source of truth for commands: **CI workflows and the lefthook git hooks call the same recipes you run locally.** When you change how something builds/lints/tests, edit the relevant `justfile` — CI (`.github/workflows/*.yml`) and hooks (`lefthook.yml`) follow automatically. CI calls recipes via `extractions/setup-just`; all GitHub Actions are pinned to commit SHAs.

## Commands

Run these from the component directory (`backend/` or `mobile/`). `just --list` shows every recipe.

**Backend** (Go 1.26; needs a container runtime — this machine uses rootless Podman via `DOCKER_HOST` in `.env`):
```bash
just db-up && just migrate && just seed && just run   # bring up Postgres + run API on :8080
just check                 # gofmt + vet + build + unit tests (the pre-commit/CI gate)
just test                  # unit tests only
just test-integration      # testcontainers integration tests (real Postgres)
just sqlc                  # regenerate internal/db after editing SQL (generated code is DO NOT EDIT)
go test -run '^TestName$' ./...                      # a single unit test
go test -tags=integration -run '^TestName$' ./...    # a single integration test
```

**Mobile** (Expo SDK 54, Node 22):
```bash
just start                 # Metro bundler; press i/a/w or scan the QR
just start-clean           # = expo start -c — restart with cleared cache (see gotcha below)
just check                 # lint + typecheck + test
just lint | just typecheck | just test
node --import tsx --test lib/members.test.ts         # a single test file
```

Committing here triggers lefthook **pre-commit** (betterleaks secret scan + fast checks) and pushing triggers **pre-push** (unit tests); both require `lefthook install` and the tools to be present.

## Architecture

**Backend.** Plain stdlib `net/http` with Go 1.22+ method-pattern routing (`mux.Handle("GET /groups/{groupId}/members", ...)`) — there is no web framework. `main.go` wires routes, the `withCORS` middleware, and graceful shutdown; `roster.go` holds the handler; `cors.go` the CORS middleware. The data layer is **sqlc-generated** into `internal/db/` from SQL in `internal/db/query/` — never hand-edit generated files; change the SQL and run `just sqlc`. Schema changes are goose migrations in `migrations/`. All config is environment-driven (the `justfile` auto-loads `.env`): `DATABASE_URL`, and `CORS_ALLOWED_ORIGINS` (comma-separated exact origins — the same mechanism in dev, CI, and prod; only the value differs).

**Mobile.** Framework-free logic lives in `lib/` (`api.ts` = backend-URL resolution, `members.ts` = fetch + payload validation) and is kept out of `App.tsx`; that separation is what makes it unit-testable. The backend base URL is resolved **at runtime** by `resolveApiBaseUrl` (`lib/api.ts`): an explicit non-localhost `EXPO_PUBLIC_API_URL` wins (staging/prod, set by CI); otherwise it derives the dev machine's LAN host from Expo's `Constants.expoConfig?.hostUri` so a physical phone can reach the dev machine; otherwise localhost (simulator/web). Note `EXPO_PUBLIC_*` vars are inlined at **bundle** time, so changing `.env` requires a Metro restart.

**Shared contract.** The seeded group UUID `11111111-1111-1111-1111-111111111111` ("Friday Film Club") is shared across the backend seed, the mobile app, and the backend integration test.

## Conventions

- **Tests are table-driven with no mocks** (pure functions). Real dependencies are exercised by integration tests: the backend uses **testcontainers** (real Postgres, gated by `//go:build integration`); the mobile "integration" test spins up a **real local HTTP server** over real `fetch`. Mobile tests run on Node's built-in `node:test` via `tsx`, mirroring the Go style.
- **Build as we go:** prefer minimal scaffolding that grows on demand — no speculative folders or layers ahead of the code.

## Gotchas

- **Mobile "Couldn't load roster: Network request failed" on a physical phone** is almost always a **stale Metro bundle** (old code that used `localhost`). Fix: `just start-clean` and re-scan the QR (don't tap a "recently opened" entry). The backend must also bind `0.0.0.0:8080`, not loopback.
- **Install betterleaks from a release binary** (`dnf`/`brew`/releases), **not `go install`** — the `go install` build ships without detection rules and silently finds nothing.
- **Mobile is pinned to Expo SDK 54 on purpose** (the Play Store Expo Go supports up to 54). Before changing Expo/native code, read the exact versioned docs per [`mobile/AGENTS.md`](mobile/AGENTS.md): <https://docs.expo.dev/versions/v54.0.0/>.
