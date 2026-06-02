# CI security gate — design

**Date:** 2026-05-29
**Status:** Approved; implemented, then revised 2026-06-02 after in-PR review (see [Revision](#revision-2026-06-02-post-review-same-pr)).
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
- **Backend tools are version-pinned, never `go install`-d ad hoc.**
  `govulncheck` is vendored via Go's `tool` directive (as `goose`/`sqlc` are).
  `gosec` is a pinned, checksum-verified **release binary** instead: as a `tool`
  dependency its autofix feature dragged heavy LLM/cloud SDKs (`anthropic-sdk-go`,
  `openai-go`, `genai`, `cloud.google.com/go/*`) into the app module's go.sum, so
  it is installed like `betterleaks`/`osv-scanner` (CI installs it; local `just
  sast` needs it on PATH).
- **CI-only enforcement.** No new lefthook hooks; commits/pushes stay fast and
  tool-free. Local runs are opt-in.
- **Scans block the build** (non-zero exit fails CI). Real-but-unactionable
  advisories are handled when they actually appear, with a documented scoped
  ignore — not pre-emptively.

## Design

### Backend — `backend/justfile` + `backend/go.mod`

Add one `tool` dependency:
- `golang.org/x/vuln/cmd/govulncheck`

`gosec` is **not** a `tool` dependency — it is a pinned, checksum-verified release
binary (see Principles), kept out of `go.mod` so its autofix LLM/cloud SDKs don't
bloat the app module.

New recipes:
- `vuln` → `go tool govulncheck ./...` — call-graph aware; reports only
  *reachable* vulnerabilities, so near-zero false positives.
- `sast` → `gosec -exclude-generated ./...` — `-exclude-generated` skips the
  sqlc-generated `internal/db/*.sql.go` DO-NOT-EDIT files.
- `audit: vuln sast` — human-readable aggregate gate (fails if either scan does).

### Decision: the `//#nosec G706` suppressions in `roster.go` are deliberate

`gosec` flags `roster.go`'s two `log.Printf("...%s...", gid, ...)` calls as G706
(CWE-117, log injection) because `gid` derives from the request path. It is a
**false positive**: `gid` is a `uuid.UUID` from `uuid.Parse`, so it can only be
canonical hex (no newlines/control characters). Both lines carry
`//#nosec G706 -- gid is a parsed uuid.UUID ...` to suppress it.

**Future readers: G706 is a real gosec check — do not delete these comments.** It
is implemented as an SSA *analyzer* (`analyzers/loginjection.go`), not an AST rule
in `rules/rulelist.go`, so grepping the rule list makes it look non-existent. The
suppression is load-bearing: without it the gate fails on these two lines.

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
- CI YAML is valid and the new `security`/`audit` jobs report on every PR.

## Future (not now)

If GitHub Security-tab integration is later wanted, it is an additive change:
have CI also emit SARIF and upload it via `github/codeql-action/upload-sarif`,
without undoing the recipes. *(Done — see the code-scanning SARIF spec.)*

## Revision (2026-06-02, post-review, same PR)

In-PR code review changed two things from the design above; both are reflected in
the body now:

- **gosec moved from a `tool` dependency to a pinned binary.** Its autofix deps
  (anthropic/openai/genai/cloud SDKs) were bloating the app module's go.sum by
  ~64 lines. `just sast` now calls the `gosec` binary; CI installs it
  checksum-verified, matching betterleaks/osv-scanner.
- **Documented the G706 false-positive suppression** (see Design) after it was
  briefly — and wrongly — removed during review on the mistaken belief that G706
  wasn't a real gosec check.

The original go-tool form is preserved in this branch's git history.
