# CI secret scan + scheduled re-scan — design

**Date:** 2026-06-01
**Status:** Approved, implementing
**Branch:** `feat/ci-security-gate`

## Problem

The current security gate (`govulncheck` + `gosec` on the backend, `osv-scanner`
on mobile) has two coverage holes identified in review:

1. **Secret scanning is local-only and bypassable.** `betterleaks` runs solely in
   the lefthook pre-commit hook, which requires `lefthook install` and is trivially
   skipped (`--no-verify`, a machine without the hook, or the GitHub web UI). There
   is no server-side secret scan, so a leaked credential in a PR is not enforced
   against.

2. **Path-filtered workflows let security posture decay silently.** `backend.yml`
   and `mobile.yml` only trigger on changes under their component paths. A CVE
   disclosed *after* merge against an unchanged dependency is never re-detected
   until someone next edits that component. There is no scheduled scan.

This adds a server-side secret scan and a weekly re-audit, staying within the
repo's "build as we go" and "`just` is the single source of truth" conventions.

## Scope

In:
- **Server-side secret scanning** on every push/PR (full git history), via
  `betterleaks` — the same tool as the local hook.
- **Weekly scheduled re-audit** of both components' dependencies, re-running the
  existing `just audit` recipes regardless of which files changed.

Out (unchanged from the prior gate; still future/additive):
- SARIF / GitHub Security-tab upload, Dependabot/Renovate, mobile JS/TS SAST,
  container/image scanning, license/IaC scanning.

## Principles

- **Existing per-component gating is untouched.** `backend.yml` (`security` job)
  and `mobile.yml` (`audit` job) keep their PR path-filtered behavior. The new
  workflow is purely additive.
- **`just` stays the source of truth for component scans.** The scheduled jobs
  call the existing `just audit` recipes; only CI *setup* steps are duplicated,
  not the security logic, so there is no drift in what gets scanned.
- **Secret scan follows the lefthook precedent.** The local hook calls
  `betterleaks` directly (not via a `just` recipe) because secret scanning is
  repo-wide and there is no root `justfile`. CI does the same — no new root
  `justfile` is introduced (build-as-we-go / YAGNI).
- **Pinned + checksum-verified binaries**, and **all GitHub Actions pinned to
  commit SHAs**, per repo convention.

## Design

### New file: `.github/workflows/security.yml`

**Triggers:**
- `push` to `main`
- `pull_request` — **no path filter** (secrets and vulnerabilities are not
  component-scoped)
- `schedule` — cron `0 6 * * 1` (Mondays 06:00 UTC)

**Top-level:** `permissions: { contents: read }` and a `concurrency` group
(`security-${{ github.ref }}`, `cancel-in-progress: true`), matching the other
workflows.

#### Job `secrets` — runs on push / PR / schedule
- `actions/checkout` (pinned SHA) with **`fetch-depth: 0`** — a full-history scan
  requires the complete history, not the default shallow clone.
- Install **betterleaks** from a pinned, SHA256-verified release binary, using the
  same install-and-verify pattern as `osv-scanner` in `mobile.yml`. The exact
  version and checksum are resolved against the betterleaks releases page at
  implementation time (verified, not guessed).
- Run `betterleaks git --no-banner` from the repo root. This is the full-history
  form of the local hook's `betterleaks git --pre-commit --staged --no-banner`
  (same subcommand, without the staged-diff narrowing). A finding exits non-zero
  and fails the job.

#### Job `backend-audit` — schedule only (`if: github.event_name == 'schedule'`)
- `actions/checkout` + `actions/setup-go` (same pinned SHAs and
  `go-version-file: backend/go.mod` as `backend.yml`).
- Run `just audit` in `backend/` (= `govulncheck` + `gosec`). No database needed.

#### Job `mobile-audit` — schedule only (`if: github.event_name == 'schedule'`)
- `actions/checkout` + install the pinned, checksum-verified `osv-scanner` binary
  (the same step already in `mobile.yml`).
- Run `just audit` in `mobile/` (scans the committed lockfile). No `npm ci` needed.

### Why a dedicated workflow rather than `schedule:` on the existing ones

Adding `schedule:` to `backend.yml`/`mobile.yml` would either re-run their full
test suites on cron or require per-job `if:` guards spread across two files, and
secret scanning still has no natural home there (it is not component-specific).
A single `security.yml` keeps each component workflow's PR behavior untouched and
centralizes all cron and repo-wide-scan configuration in one place.

## Verification

Before claiming done:
- `security.yml` is valid YAML; jobs and triggers parse as intended.
- The betterleaks install step uses a real, pinned version whose published SHA256
  matches the verification line (confirmed against the releases page).
- The `secrets` job runs on push/PR (no path filter) and the `*-audit` jobs are
  correctly gated to the `schedule` event only.
- A local `betterleaks git --no-banner` from the repo root exits 0 on the clean
  tree (or surfaces a real finding), confirming the command form.
- The scheduled jobs invoke the unchanged `just audit` recipes.

## Future (not now)

Additive, non-breaking when wanted: emit SARIF from these scans and upload via
`github/codeql-action/upload-sarif` for the Security tab; add Dependabot/Renovate
for automated dependency-bump PRs; add a JS/TS security-lint pass for mobile.
