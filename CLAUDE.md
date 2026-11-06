# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

A monorepo with two independent components, each with its own toolchain, `justfile`, and README:

- **`backend/`** — Go HTTP API over PostgreSQL. See [`backend/README.md`](backend/README.md).
- **`mobile/`** — Expo / React Native app (expo-router tabs: Tonight, Watched, Club; Settings and the night plan/edit flows are stack screens). See [`mobile/README.md`](mobile/README.md).

`just` is the single source of truth for commands: **CI workflows and the lefthook git hooks call the same recipes you run locally.** When you change how something builds/lints/tests, edit the relevant `justfile` — CI (`.github/workflows/*.yml`) and hooks (`lefthook.yml`) follow automatically. CI calls recipes via `extractions/setup-just`; all GitHub Actions are pinned to commit SHAs.

CI is split by purpose, not by component: **`ci.yml`** ("did my change break anything?" — `backend-check`, `mobile-check`) and **`security.yml`** ("is there a known vuln or leak?" — `backend-audit`, `mobile-audit`, `secrets`, `codeql (<language>)`; the only workflow with the weekly cron and `security-events: write`). Job `name:`s are the required-check contexts in the `main-ruleset`, so renaming a job means updating the ruleset in the same change, or the PR blocks on a check that never reports.

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

**Mobile** (Expo SDK 58, Node 22):
```bash
just android               # build/install the Android dev client + Metro
just start                 # Metro only (dev client already installed)
just start-clean           # = expo start -c — restart with cleared cache
just android-clean         # delete android/ and rebuild (CNG recovery)
just check                 # lint + typecheck + test + check-deps (Expo SDK version matrix)
just lint | just typecheck | just test | just check-deps
node --import tsx --test lib/members.test.ts         # a single test file
```

Committing here triggers lefthook **pre-commit** (betterleaks secret scan + fast checks) and pushing triggers **pre-push** (unit tests); both require `lefthook install` and the tools to be present.

## Architecture

**Backend.** Plain stdlib `net/http` with Go 1.22+ method-pattern routing (`mux.Handle("GET /groups/{groupId}/members", ...)`) — there is no web framework. `main.go` wires the route table, the `withCORS` middleware (`cors.go`), the once-a-minute reminder loop (`reminders.go`), and graceful shutdown. Handlers live in one file per resource (`group.go`, `roster.go`, `membership.go`, `identity.go`, `nights.go`, `movies.go`); multi-statement night writes go through `night_writes.go` in one transaction (`tx.go`). The data layer is **sqlc-generated** into `internal/db/` from SQL in `internal/db/query/` — never hand-edit generated files; change the SQL and run `just sqlc`. Schema changes are goose migrations in `migrations/` (squashed to one baseline before launch; add new ones on top); a full Night is read only through the `full_nights` view (the `nights` table plus its film), so a new Night column is added to that view too. All config is environment-driven (the `justfile` auto-loads `.env`): `DATABASE_URL`, `CORS_ALLOWED_ORIGINS` (comma-separated exact origins — the same mechanism in dev, CI, and prod; only the value differs), and the optional `TMDB_READ_TOKEN` (movie endpoints return 503 without it) and `EXPO_ACCESS_TOKEN` (push).

**Mobile.** Framework-free logic lives in `lib/` (e.g. `api.ts` = backend-URL resolution, `members.ts` = fetch + payload validation, `nightEdit.ts` = night-editing rules) and is kept out of the screens in `app/` and `components/`; that separation is what makes it unit-testable. Native APIs (secure storage, push, calendar) sit behind thin adapters at the `mobile/` root (`identityToken.ts`, `pushDevice.ts`, `calendarExport.ts`, `apiUrl.ts`) so `lib/` never imports React Native or Expo. The backend base URL is resolved **at runtime** by `resolveApiBaseUrl` (`lib/api.ts`): an explicit non-localhost `EXPO_PUBLIC_API_URL` wins (staging/prod, set by CI); otherwise it derives the dev machine's LAN host from Expo's `Constants.expoConfig?.hostUri` so a physical phone can reach the dev machine; otherwise localhost (simulator/web). Note `EXPO_PUBLIC_*` vars are inlined at **bundle** time, so changing `.env` requires a Metro restart.

**Shared contract.** The seeded group UUID `11111111-1111-1111-1111-111111111111` ("Friday Film Club") is shared across the backend seed, the mobile app, and the backend integration test.

## Conventions

- **Tests are table-driven with no mocks** (pure functions). Real dependencies are exercised by integration tests: the backend uses **testcontainers** (real Postgres, gated by `//go:build integration`); the mobile "integration" test spins up a **real local HTTP server** over real `fetch`. Mobile tests run on Node's built-in `node:test` via `tsx`, mirroring the Go style.
- **Build as we go:** prefer minimal scaffolding that grows on demand — no speculative folders or layers ahead of the code.

## Gotchas

- **A physical phone can run a stale Metro bundle**, and not only as "Couldn't load roster: Network request failed" (old code that used `localhost`). A long-running Metro can serve the phone's Hermes bundle an outdated transform even when a `curl` of the bundle shows the new code, so an on-device repro silently runs old code. **Before trusting any on-device result, run `just phone has <something from your change>`** (from `mobile/`). If it's missing, run `just start-clean` and `just phone launch`. The backend must also bind `0.0.0.0:8080`, not loopback.
- **Drive the adb-attached phone with `just phone`** (`mobile/scripts/phone.sh`): `launch [port]`, `tap "<text>"`, `dump`, `shot <file>`, `has <text>`. Don't hand-roll `uiautomator`/deep-link scripts, and don't run device-wide `dumpsys`.
- **Install betterleaks from a release binary** (`dnf`/`brew`/releases), **not `go install`** — the `go install` build ships without detection rules and silently finds nothing. Repo-wide betterleaks config (e.g. the filter for the published `movie:movie@localhost` dev credential) lives in `.betterleaks.toml` at the root; scope any new exception to the exact value, never a whole rule or path.
- **gosec is a go tool in its own module, `backend/tools/gosec/go.mod`** — not in `backend/go.mod`, because its autofix feature pulls in heavy LLM/cloud SDKs. The recipes run it via `go tool -modfile=tools/gosec/go.mod gosec`, so no install is needed; bump it with `go get -tool github.com/securego/gosec/v2/cmd/gosec@<ver>` from that directory (Dependabot does this weekly).
- **CI's osv-scanner and betterleaks versions are pinned in `.github/tools/<tool>/Dockerfile`** (tag + digest, bumped by Dependabot's `docker` ecosystem); `security.yml` copies the static binary out of that image. To bump by hand, edit only the `FROM` line. Locally they're still whatever's on your `PATH`, so they can lag CI.
- **Mobile targets Expo SDK 58** and uses **local development builds** (`expo-dev-client`), not Expo Go, for physical Android testing. Rebuild the native client after SDK or native-dependency changes (`just android` or `just android-clean`). Before changing Expo/native code, read the exact versioned docs per [`mobile/AGENTS.md`](mobile/AGENTS.md): <https://docs.expo.dev/versions/v58.0.0/>.
- **Mobile typecheck needs `"types": ["node"]` in `mobile/tsconfig.json`** — TypeScript 6 (Expo SDK) no longer auto-includes `@types/node`, and the `lib/*.test.ts` files use `node:` built-ins (`node:test`, `Buffer`, …). Without it, `just typecheck` fails with TS2591 "Cannot find name 'node:test'". `@types/node` is pinned to the Node 22 runtime major.
