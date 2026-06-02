# CI secret scan + scheduled re-scan — design

**Date:** 2026-06-01
**Status:** Approved; revised 2026-06-02 after in-PR review (see [Revision](#revision-2026-06-02-post-review-same-pr)).
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

- **Per-component PR gating is unchanged.** `backend.yml` (`security` job) and
  `mobile.yml` (`audit` job) keep gating every PR. The weekly re-audit is added to
  those same workflows via a `schedule` trigger (their `test`/`check` jobs are
  skipped on the cron); the security/audit jobs already there do the re-scan.
- **`just` stays the source of truth for component scans.** The scheduled runs
  call the existing component scan recipes; only the trigger is added, not the
  security logic, so there is no drift in what gets scanned.
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
- `pull_request` — **no path filter** (secrets are not component-scoped)

(No `schedule` here — the weekly dependency re-audit lives in the component
workflows' own `schedule` triggers; a cron secret scan adds nothing since history
is unchanged between runs.)

**Top-level:** `permissions: { contents: read }` and a `concurrency` group
(`security-${{ github.ref }}`, `cancel-in-progress: true`), matching the other
workflows.

#### Job `secrets` — runs on push / PR
- `actions/checkout` (pinned SHA) with **`fetch-depth: 0`** — a full-history scan
  requires the complete history, not the default shallow clone.
- Install **betterleaks** from a pinned, SHA256-verified release binary, using the
  same install-and-verify pattern as `osv-scanner` in `mobile.yml`. The exact
  version and checksum are resolved against the betterleaks releases page at
  implementation time (verified, not guessed).
- Run `betterleaks git --no-banner` from the repo root. This is the full-history
  form of the local hook's `betterleaks git --pre-commit --staged --no-banner`
  (same subcommand, without the staged-diff narrowing). A finding exits non-zero
  and fails the job. *(The code-scanning SARIF spec later folds SARIF emission
  into this same single run.)*

#### Weekly dependency re-audit — on the component workflows, not here
`backend.yml` and `mobile.yml` each gain a `schedule` trigger (cron `0 6 * * 1`,
Mondays 06:00 UTC). On that event their build/test job (`test` / `check`) is
skipped via `if: github.event_name != 'schedule'`, while their existing
`security` / `audit` job re-runs the dependency scan against the unchanged tree.
No dedicated re-audit jobs live in `security.yml`.

### Where the schedule lives (revised — see Revision)

The weekly re-audit triggers from `backend.yml`/`mobile.yml` themselves, with a
one-line `if: github.event_name != 'schedule'` guard skipping their build/test
job on the cron. `security.yml` holds only the repo-wide `secrets` job.

The original design instead put dedicated `backend-audit`/`mobile-audit` jobs in
`security.yml` to avoid those `if:` guards. Review reversed this: those jobs were
near-verbatim copies of the component workflows' security jobs, so one `if:` guard
per workflow is less duplication than two cloned jobs to keep in sync. Secret
scanning still has no per-component home, so it stays in `security.yml`.

## Verification

Before claiming done:
- `security.yml`, `backend.yml`, `mobile.yml` are valid YAML; jobs and triggers
  parse as intended.
- The betterleaks install step uses a real, pinned version whose published SHA256
  matches the verification line (confirmed against the releases page).
- The `secrets` job runs on push/PR (no path filter); `backend.yml`/`mobile.yml`
  gain the `schedule` trigger with their build/test job skipped on cron.
- A local `betterleaks git --no-banner` from the repo root exits 0 on the clean
  tree (or surfaces a real finding), confirming the command form.
- The scheduled runs invoke the unchanged component scan recipes.

## Future (not now)

Additive, non-breaking when wanted: emit SARIF from these scans and upload via
`github/codeql-action/upload-sarif` for the Security tab; add Dependabot/Renovate
for automated dependency-bump PRs; add a JS/TS security-lint pass for mobile.

## Revision (2026-06-02, post-review, same PR)

In-PR review moved the weekly re-audit out of `security.yml` and into the
component workflows. The body above reflects the final design. Change:

- **Dropped the `backend-audit` and `mobile-audit` jobs** from `security.yml` —
  they duplicated `backend.yml`'s `security` job and `mobile.yml`'s `audit` job
  almost verbatim.
- **Added a `schedule` trigger to `backend.yml`/`mobile.yml`**, with their
  `test`/`check` jobs guarded by `if: github.event_name != 'schedule'`. The
  security/audit jobs already there now double as the weekly re-audit.
- `security.yml` no longer carries a `schedule` trigger; it is just the repo-wide
  `secrets` job.

Net: one definition per component scan instead of two kept-in-sync copies.
