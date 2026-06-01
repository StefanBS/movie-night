# Code scanning (SARIF → Security tab) — design

**Date:** 2026-06-01
**Status:** Approved, implementing
**Branch:** `feat/ci-security-gate` (same PR #2 that introduced the gate)

## Problem

The security gate detects findings but they live only in CI logs. There is no
triage surface, no dedupe, no history, and no PR-diff awareness. The weekly
scheduled re-audit can go red with nobody reliably looking. The repo has been
made **public**, so GitHub **code scanning** (SARIF upload to the Security tab)
is now available for free — the right home for these findings.

## Scope

In:
- Emit **SARIF** from all four scanners (govulncheck, gosec, osv-scanner,
  betterleaks) and upload it to the GitHub code-scanning Security tab.
- Wire SARIF into **both** PR/push jobs (diff-aware, at-introduction alerts) and
  the **scheduled** jobs (newly-disclosed CVEs in unchanged code). This is
  "approach B".

Out (still future/additive):
- Dependabot/Renovate (automated dependency-bump PRs).
- Mobile JS/TS SAST.
- Container/IaC scanning.
- Any external notification channel (Slack/email beyond GitHub defaults) — the
  decision was **GitHub-only**: code-scanning alerts + GitHub's built-in
  scheduled-workflow-failure email.

## Principles

- **`just` stays the source of truth for component scans.** SARIF generation is
  added as new `just` recipes; the SARIF upload itself is workflow glue (a
  GitHub Action, not expressible as a recipe).
- **Do not degrade local DX or the existing gate.** The text recipes
  (`vuln`/`sast`/`audit`) are unchanged — they still gate the build with readable
  output. SARIF is purely additive.
- **Pinned everything.** The new `github/codeql-action/upload-sarif` action is
  pinned to a commit SHA, like every other action.
- **Least privilege.** Top-level `permissions` stays `contents: read`; only the
  jobs that upload get job-level `security-events: write`.

## Design

### New `just` recipes (SARIF emitters, exit 0 regardless of findings)

Gating remains the job of the existing text recipes; these only produce files.

`backend/justfile`:
```just
# Emit SARIF for upload to code scanning (does NOT gate — `just audit` gates)
audit-sarif:
    -go tool govulncheck -format sarif ./... > govulncheck.sarif
    -go tool gosec -exclude-generated -fmt sarif -out gosec.sarif ./...
```
- `govulncheck -format sarif` always exits 0 (cannot gate — that is why the text
  `vuln` recipe still runs to gate).
- `gosec ... -out gosec.sarif` writes the file then exits non-zero on findings;
  the leading `-` (just's ignore-error prefix) swallows that so the recipe
  itself stays green.

`mobile/justfile`:
```just
# Emit SARIF for upload to code scanning (does NOT gate — `just audit` gates)
audit-sarif:
    -osv-scanner scan source --lockfile=package-lock.json --config=osv-scanner.toml --format sarif > osv-scanner.sarif
```
- osv-scanner has no documented `--output` flag; SARIF goes to stdout (logs go to
  stderr), so it is redirected to the file. osv-scanner exits non-zero on vulns;
  the `-` prefix swallows it so the recipe stays green (gating is `just audit`).

betterleaks SARIF is produced inline in the `secrets` job (no justfile; it is a
repo-wide tool invoked directly, consistent with lefthook). `--exit-code 0`
forces a green exit so the upload step always runs (gating is the separate
`betterleaks git --no-banner` step, which keeps its default exit-1-on-leak):
```
betterleaks git --no-banner --report-format sarif --report-path betterleaks.sarif --exit-code 0
```

### Per-job step pattern (identical shape everywhere)

Order matters so SARIF uploads **even when findings exist**:

1. **Produce SARIF** — `just audit-sarif` (or the betterleaks command). Exits 0.
2. **Upload** — one `github/codeql-action/upload-sarif` step per SARIF file, each
   with a stable `category` so PR and scheduled runs of the same tool update the
   same logical analysis instead of duplicating. Categories: `govulncheck`,
   `gosec`, `osv-scanner`, `betterleaks`. Pinned to
   `github/codeql-action/upload-sarif@84498526a009a99c875e83ef4821a8ba52de7c22`
   (`codeql-bundle-v2.25.5`).
3. **Gate** — the existing text recipe (`just audit`, or `betterleaks git
   --no-banner` for secrets) runs last and fails the job red on findings.

Trade-off accepted: each tool runs twice (once for SARIF, once to gate). On this
small codebase the cost is a few seconds, and it keeps the existing gate
untouched and dependency-free (no SARIF parsing / no `jq`).

### Fork-PR guard

The repo is public, so PRs can come from forks whose `GITHUB_TOKEN` is read-only
(`security-events: write` denied → upload would error). Every upload step is
guarded:
```yaml
if: github.event.pull_request.head.repo.fork != true
```
On push/schedule (`github.event.pull_request` is null) this evaluates true →
uploads. On same-repo PRs (fork == false) → uploads. On fork PRs (fork == true)
→ upload skipped; the scan still gates the PR via its exit code.

### Workflows touched

- `.github/workflows/backend.yml` — `security` job: add job-level
  `permissions: { contents: read, security-events: write }`; run `just
  audit-sarif`; upload `govulncheck.sarif` (category `govulncheck`) and
  `gosec.sarif` (category `gosec`); then `just audit` to gate.
- `.github/workflows/mobile.yml` — `audit` job: add the permission; run `just
  audit-sarif`; upload `osv-scanner.sarif` (category `osv-scanner`); then `just
  audit` to gate.
- `.github/workflows/security.yml`:
  - `secrets` job (push/PR/schedule): add permission; run betterleaks in SARIF
    mode; upload `betterleaks.sarif` (category `betterleaks`); then `betterleaks
    git --no-banner` to gate.
  - `backend-audit` (schedule): add permission; `just audit-sarif` + upload +
    `just audit` gate.
  - `mobile-audit` (schedule): add permission; `just audit-sarif` + upload +
    `just audit` gate.

The `mobile-audit` job currently has no `npm ci`; osv-scanner only needs the
committed lockfile, so SARIF mode needs nothing extra. The `backend-audit` job
already sets up Go, so `audit-sarif` runs as-is.

## Verification

Before claiming done:
- `just audit-sarif` (backend and mobile) produces valid SARIF files locally and
  exits 0 even when a finding exists.
- Each SARIF validates as JSON and contains a `runs[].tool.driver.name`.
- The text gate recipes still fail on findings (unchanged behaviour).
- All workflow YAML parses; `upload-sarif` is pinned to a SHA; every upload step
  carries the fork guard and the job carries `security-events: write`.
- After merge, a scheduled/PR run shows analyses for all four categories in the
  repo's Security → Code scanning tab.

## Future (not now)

Dependabot/Renovate; mobile JS/TS SAST (e.g. an `eslint-plugin-security` pass);
container/IaC scanning. All additive and non-breaking.
