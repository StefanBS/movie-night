# Code scanning (SARIF → Security tab) — design

**Date:** 2026-06-01
**Status:** Approved; revised 2026-06-02 after in-PR review (see [Revision](#revision-2026-06-02-post-review-same-pr)).
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

### New `just` recipes (emit SARIF **and** gate, in a single scan run)

Each `audit-sarif` recipe produces the SARIF file **and** fails on findings, from
one scan run. (The text `vuln`/`sast`/`audit` recipes are unchanged and remain the
readable local gate.) CI uploads the SARIF with `if: always()`, so findings still
reach the Security tab when the recipe fails — no separate non-gating run needed.

`backend/justfile`:
```just
# Emit SARIF for the code-scanning upload AND gate it, each from a single scan run.
audit-sarif:
    #!/usr/bin/env bash
    set -uo pipefail
    rc=0
    gosec -exclude-generated -fmt sarif -out gosec.sarif ./... || rc=1
    go tool govulncheck -format sarif ./... > govulncheck.sarif || rc=1
    n=$(jq '[.runs[].results[] | select(.level == "error")] | length' govulncheck.sarif 2>/dev/null || echo 0)
    if [ "${n:-0}" -gt 0 ]; then rc=1; fi
    exit $rc
```
- `gosec ... -out gosec.sarif` writes the file then exits non-zero on findings →
  gates directly. (gosec is the pinned binary, not `go tool` — see the gate spec.)
- `govulncheck -format sarif` **always exits 0** even with vulnerabilities (exit-3
  is text-mode only). So it writes SARIF, then we gate on any reachable
  (`level == "error"`) result via `jq` — the same thing text mode exits 3 for.
  `jq` ships on GitHub runners and is a common local tool.

`mobile/justfile`:
```just
# Emit SARIF for the code-scanning upload AND gate it, in a single scan run.
audit-sarif:
    osv-scanner scan source --lockfile=package-lock.json --config=osv-scanner.toml --format sarif > osv-scanner.sarif
```
- osv-scanner has no documented `--output` flag; SARIF goes to stdout (logs to
  stderr) and is redirected to the file. It exits non-zero on vulns regardless of
  format, so the single run both emits SARIF and gates.

betterleaks SARIF is produced inline in the `secrets` job (no justfile; it is a
repo-wide tool invoked directly, consistent with lefthook). A single run emits
SARIF and gates — betterleaks keeps its default exit-1-on-leak (no `--exit-code 0`
override):
```
betterleaks git --no-banner --report-format sarif --report-path betterleaks.sarif
```

### Per-job step pattern (identical shape everywhere)

A single scan run produces SARIF and gates; the upload runs unconditionally so
findings reach the Security tab even when the gate fails:

1. **Scan once** — `just audit-sarif` (or the betterleaks command). Emits SARIF
   and fails the step on findings.
2. **Upload** — one `github/codeql-action/upload-sarif` step per SARIF file,
   guarded `if: always() && <fork guard>` so it runs even after step 1 fails.
   Each carries a stable `category` so PR and scheduled runs of the same tool
   update the same logical analysis instead of duplicating. Categories:
   `govulncheck`, `gosec`, `osv-scanner`, `betterleaks`. Pinned to
   `github/codeql-action/upload-sarif@84498526a009a99c875e83ef4821a8ba52de7c22`
   (`codeql-bundle-v2.25.5`).

Each tool runs **once**. govulncheck needs `jq` to gate from its SARIF (its SARIF
mode can't gate by exit code); `jq` ships on GitHub runners and is a common local
tool — an acceptable dependency for not scanning everything twice.

### Fork-PR guard

The repo is public, so PRs can come from forks whose `GITHUB_TOKEN` is read-only
(`security-events: write` denied → upload would error). Every upload step is
guarded — combined with `always()` so it still runs when the scan step failed:
```yaml
if: always() && github.event.pull_request.head.repo.fork != true
```
On push/schedule (`github.event.pull_request` is null) the fork term is true →
uploads. On same-repo PRs (fork == false) → uploads. On fork PRs (fork == true)
→ upload skipped; the scan still gates the PR via its exit code.

### Workflows touched

- `.github/workflows/backend.yml` — `security` job: add job-level
  `permissions: { contents: read, security-events: write }`; install the pinned
  `gosec` binary; run `just audit-sarif` (emits SARIF + gates); upload
  `govulncheck.sarif` (category `govulncheck`) and `gosec.sarif` (category
  `gosec`) with `if: always() && <fork guard>`.
- `.github/workflows/mobile.yml` — `audit` job: add the permission; run `just
  audit-sarif`; upload `osv-scanner.sarif` (category `osv-scanner`) with
  `if: always() && <fork guard>`.
- `.github/workflows/security.yml` — `secrets` job (push/PR): add permission; run
  betterleaks in SARIF mode (emits + gates); upload `betterleaks.sarif`
  (category `betterleaks`) with `if: always() && <fork guard>`.

The weekly **scheduled** re-audits run from `backend.yml`/`mobile.yml`'s own
`schedule` triggers (see the secret-scan + scheduled-rescan spec), not from
dedicated jobs in `security.yml`.

## Verification

Before claiming done:
- `just audit-sarif` (backend and mobile) produces valid SARIF files locally;
  it **exits non-zero when a finding exists** (it both emits and gates) and 0 on
  a clean tree.
- Each SARIF validates as JSON and contains a `runs[].tool.driver.name`.
- The text gate recipes (`vuln`/`sast`/`audit`) still fail on findings (unchanged).
- All workflow YAML parses; `upload-sarif` is pinned to a SHA; every upload step
  carries `if: always() && <fork guard>` and the job carries
  `security-events: write`.
- After merge, a scheduled/PR run shows analyses for all four categories in the
  repo's Security → Code scanning tab.

## Future (not now)

Dependabot/Renovate; mobile JS/TS SAST (e.g. an `eslint-plugin-security` pass);
container/IaC scanning. All additive and non-breaking.

## Revision (2026-06-02, post-review, same PR)

In-PR code review removed the **double scan run** this design originally accepted;
the body above reflects the final, single-run design. What changed:

- `audit-sarif` now **emits SARIF and gates in one run** (was: a non-gating SARIF
  run with `-`-swallowed errors, followed by a second `just audit` run to gate).
  govulncheck's SARIF mode can't gate by exit code, so its run gates via a `jq`
  check on `level == "error"` results.
- Uploads moved to `if: always() && <fork guard>` so SARIF still publishes when
  the single run fails.
- The betterleaks `--exit-code 0` override was dropped (one run gates + emits).

This halves security-job scan time on every push/PR. The trade-off the original
accepted (avoid a `jq` dependency) was reversed in favour of not scanning twice.
See also the scheduled-rescan spec's revision (scheduled audit jobs moved out of
`security.yml`).
