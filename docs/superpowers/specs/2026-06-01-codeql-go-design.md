# CodeQL Go (add to JS/TS matrix) — design

**Date:** 2026-06-01
**Status:** Approved, implementing
**Branch:** `feat/ci-security-gate` (same PR as the rest of the security gate)

## Problem

CodeQL currently analyses only `javascript-typescript`. For completeness we want
CodeQL's Go dataflow/taint analysis on the backend too. It is **complementary**
to gosec (Go-idiom rules) and govulncheck (CVEs), not a replacement — gosec
stays.

## Scope

In: extend `.github/workflows/codeql.yml` to a language matrix covering
`javascript-typescript` (unchanged, buildless) and `go` (with a build).

Out (future/additive): `security-extended` query suite; making the CodeQL checks
required in branch protection.

## Design

Convert the single `analyze` job in `.github/workflows/codeql.yml` into a matrix;
keep triggers, top-level `permissions`, `concurrency`, and pinned SHAs as-is.

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - language: javascript-typescript
        build-mode: none
      - language: go
        build-mode: manual
```

**Go leg (conditional on `matrix.language == 'go'`):**
1. `actions/setup-go@4a3601121dd01d1626a1e23e37211e3254c1c06c` (# v6.4.0, same pin
   as `backend.yml`) with `go-version-file: backend/go.mod` and
   `cache-dependency-path: backend/go.sum` — installs Go 1.26.3.
2. A traced build step **between `init` and `analyze`**:
   `working-directory: backend`, `run: go build ./...`.

**Why `build-mode: manual` for Go:** the Go module is in `backend/`, not the repo
root. CodeQL `autobuild` runs `go build ./...` from the root and fails (no root
`go.mod`). Manual mode lets the explicit `backend/` build be traced —
deterministic, and mirrors what `backend.yml` already compiles. (`build-mode:
none` would extract without compiling — lower-fidelity dataflow; manual is chosen
for full analysis.)

**Shared steps:** `actions/checkout` (existing pin) runs for both legs;
`github/codeql-action/init` uses `languages: ${{ matrix.language }}` and
`build-mode: ${{ matrix.build-mode }}`; `github/codeql-action/analyze` uses
`category: "/language:${{ matrix.language }}"`. The init/analyze SHA stays
`84498526a009a99c875e83ef4821a8ba52de7c22` (codeql-bundle-v2.25.5).

`fail-fast: false` so one language's failure doesn't cancel the other.

**Permissions:** unchanged — job-level `contents: read`, `security-events:
write`, `actions: read` already present and correct for both legs.

**Header comment:** update to state the workflow now covers JS/TS and Go, with
gosec kept as a complementary Go linter.

**Check-name change:** matrixing renames the check from `analyze` to
`analyze (javascript-typescript)` and `analyze (go)`. No impact today (CodeQL is
not a required check); relevant only if added to branch protection later.

## Verification

- `.github/workflows/codeql.yml` is valid YAML; the matrix has both languages
  with the stated build-modes; the setup-go and `go build ./...` steps are gated
  to `matrix.language == 'go'`; `fail-fast: false` present.
- All `uses:` pinned to commit SHAs (checkout, setup-go, codeql-action ×2).
- `backend` builds cleanly with `go build ./...` (already true in CI) so the
  manual-build leg succeeds.
- After merge/run, the Security tab shows CodeQL analyses for both
  `javascript-typescript` and `go`. (CodeQL runs only in GitHub Actions.)

## Future (not now)

`security-extended` queries; make the CodeQL checks required status checks.
