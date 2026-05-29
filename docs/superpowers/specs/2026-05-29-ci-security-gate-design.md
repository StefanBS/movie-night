# CI security gate — design

**Date:** 2026-05-29
**Status:** Approved, implementing
**Branch:** `feat/ci-security-gate`

## Problem

CI (`backend.yml`, `mobile.yml`) runs build/lint/test only. There is no
dependency-vulnerability scanning and no Go static-analysis. Secret scanning
already exists locally via `betterleaks` in the lefthook pre-commit hook, so
secrets are out of scope here.

This adds a **minimal, high-signal security gate**, scoped deliberately small in
keeping with the repo's "build as we go" convention. It is **not** the 20-tool
menu from `docs/security-tools-analysis-2026.md` (that document was an unverified
external proposal and contained at least one incorrect claim, e.g. a non-existent
"gosec v2" product distinct from `securego/gosec`).

## Scope

In:
- **Backend (Go):** dependency vulnerability scanning (`govulncheck`) + static
  analysis (`gosec`).
- **Mobile (npm):** dependency vulnerability scanning (`osv-scanner`).

Out (decided against, to avoid noise/maintenance on a walking-skeleton):
- Go SAST beyond gosec; JS/TS security-lint plugins; secret scan in CI
  (already covered locally); SBOM, CodeQL, Snyk, Dependabot, etc.

## Principles

- **`just` is the single source of truth.** Every scan is a `just` recipe; CI
  calls the same recipe a developer runs locally. No CI-only security Actions.
- **Backend tools are vendored via Go's `tool` directive** (as `goose` and
  `sqlc` already are), so versions are pinned in `go.mod`/`go.sum` — reproducible,
  no ad-hoc `go install`.
- **CI-only enforcement.** No new lefthook hooks; commits/pushes stay fast and
  tool-free. Local runs are opt-in.
- **Scans block the build** (non-zero exit fails CI). Real-but-unactionable
  advisories are handled when they actually appear, with a documented scoped
  ignore — not pre-emptively.

## Design

### Backend — `backend/justfile` + `backend/go.mod`

Add two `tool` dependencies:
- `golang.org/x/vuln/cmd/govulncheck`
- `github.com/securego/gosec/v2/cmd/gosec`

New recipes:
- `vuln` → `go tool govulncheck ./...` — call-graph aware; reports only
  *reachable* vulnerabilities, so near-zero false positives.
- `sast` → `go tool gosec -exclude-generated ./...` — `-exclude-generated` skips
  the sqlc-generated `internal/db/*.sql.go` DO-NOT-EDIT files.
- `audit: vuln sast` — aggregate for one-shot local use.

### Mobile — `mobile/justfile`

New recipe:
- `audit` → `osv-scanner scan source --lockfile=package-lock.json` — scans the
  committed lockfile; precise and low-noise. Requires the `osv-scanner` binary on
  PATH locally (same opt-in posture as `betterleaks`); CI installs it.

### CI wiring

- `.github/workflows/backend.yml`: new `security` job, parallel to `test`, sets
  up Go (same pinned action SHAs) and runs `just audit`.
- `.github/workflows/mobile.yml`: new `audit` job, parallel to `check`, installs
  a **pinned** `osv-scanner` release binary, then runs `just audit`.

All GitHub Actions stay pinned to commit SHAs, per repo convention.

## Verification

Before claiming done:
- `just vuln`, `just sast`, `just audit` run locally and exit as expected
  (0 on a clean tree, or surface a real finding).
- Tool invocation syntax confirmed against each tool's current docs — not the
  analysis doc.
- CI YAML is valid and the new jobs are scoped by the existing path filters.

## Future (not now)

If GitHub Security-tab integration is later wanted, it is an additive change:
have CI also emit SARIF and upload it via `github/codeql-action/upload-sarif`,
without undoing the recipes.
