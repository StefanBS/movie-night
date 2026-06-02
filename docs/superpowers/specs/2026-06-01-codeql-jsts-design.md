# CodeQL JS/TS SAST — design

**Date:** 2026-06-01
**Status:** Approved, implementing
**Branch:** `feat/ci-security-gate` (same PR as the rest of the security gate)

## Problem

The security gate has SAST for Go (gosec) but none for the mobile JS/TS code —
the one coverage asymmetry left after secret scanning, dependency scanning, and
code-scanning upload were added. Now that the repo is public, GitHub **CodeQL**
(real dataflow SAST for JavaScript/TypeScript) is free and integrates natively
with the code-scanning Security tab already in use.

## Scope

In: a single `.github/workflows/codeql.yml` running CodeQL analysis for
`javascript-typescript`, results uploaded to the Security tab.

Out (future/additive):
- Go via CodeQL (redundant with gosec today).
- The `security-extended` query suite (default suite is used — lower noise).

## Design

### New file: `.github/workflows/codeql.yml`

**Triggers** (consistent with the other workflows / the required-check-safe
decision):
- `push` to `main`
- `pull_request` — **no path filter**, so the check always reports and can be
  added to branch protection later
- `schedule` — cron `0 6 * * 1` (Mon 06:00 UTC, matches the security cron)

**Top-level:** `permissions: contents: read`; `concurrency` group
`codeql-${{ github.ref }}` with `cancel-in-progress: true`.

**Job `analyze`:**
- Job-level `permissions`: `contents: read`, `security-events: write`,
  `actions: read` (CodeQL requires the last two to upload results / read the
  run).
- Steps:
  1. `actions/checkout` (pinned SHA, same as other workflows).
  2. `github/codeql-action/init` with `languages: javascript-typescript`.
  3. `github/codeql-action/analyze` with `category: "/language:javascript-typescript"`.
- **No `npm ci` / no autobuild** — JS/TS is interpreted; CodeQL extracts source
  directly without installing dependencies or building.

**Pinning:** `init` and `analyze` pin to the same commit SHA already used for
`upload-sarif` — `github/codeql-action/...@84498526a009a99c875e83ef4821a8ba52de7c22`
(`codeql-bundle-v2.25.5`) — since they live in the same action repo.

**Coverage notes:** CodeQL auto-ignores `node_modules`; all repo JS/TS is under
`mobile/`, so it analyses the app code (plus harmless config files like
`eslint.config.js`). CodeQL's category is distinct from the gosec / govulncheck /
osv-scanner / betterleaks SARIF categories, so analyses don't collide.

## Verification

- `.github/workflows/codeql.yml` is valid YAML; triggers, permissions, and the
  pinned SHA are present; `languages: javascript-typescript` set.
- All `uses:` pinned to commit SHAs.
- After merge/run, the Security tab shows a CodeQL analysis for
  javascript-typescript alongside the existing tool categories. (CodeQL runs only
  in GitHub Actions; there is no meaningful local invocation to verify.)

## Future (not now)

Add Go to the CodeQL language matrix; opt into `security-extended` queries; make
the CodeQL check a required status check in branch protection.
