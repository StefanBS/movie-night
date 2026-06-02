# CI Secret Scan + Scheduled Re-scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single `.github/workflows/security.yml` that runs server-side secret scanning on every push/PR (full history) and re-audits both components' dependencies on a weekly cron.

**Architecture:** One additive workflow. A `secrets` job runs on push/PR/schedule and scans full git history with betterleaks (the same tool as the local lefthook hook). Two schedule-only jobs (`backend-audit`, `mobile-audit`) re-run the existing `just audit` recipes so newly-disclosed CVEs in untouched code surface weekly. Existing `backend.yml`/`mobile.yml` security jobs are untouched.

**Tech Stack:** GitHub Actions; betterleaks v1.3.1 (pinned tarball + SHA256); osv-scanner v2.3.8 (pinned binary, reused from `mobile.yml`); `just` recipes for the audits.

**Spec:** `docs/superpowers/specs/2026-06-01-ci-secret-scan-scheduled-rescan-design.md`

---

### Task 1: Add `.github/workflows/security.yml`

**Goal:** Create the security workflow with one push/PR/schedule secret-scan job and two schedule-only dependency-audit jobs.

**Files:**
- Create: `.github/workflows/security.yml`
- Reference only (do NOT modify): `.github/workflows/backend.yml`, `.github/workflows/mobile.yml` (pinned action SHAs + osv-scanner install block), `lefthook.yml` (betterleaks invocation form).

**Acceptance Criteria:**
- [ ] Triggers: `push` to `main`, `pull_request` (no path filter), `schedule` cron `0 6 * * 1`.
- [ ] Top-level `permissions: contents: read` and a `concurrency` group `security-${{ github.ref }}` with `cancel-in-progress: true`.
- [ ] `secrets` job: `actions/checkout` with `fetch-depth: 0`; betterleaks installed from the pinned tarball and SHA256-verified; runs `betterleaks git --no-banner` from repo root.
- [ ] `backend-audit` job: gated `if: github.event_name == 'schedule'`; `setup-go` (`go-version-file: backend/go.mod`) + `setup-just`; runs `just audit` in `backend/`.
- [ ] `mobile-audit` job: gated `if: github.event_name == 'schedule'`; installs pinned osv-scanner; runs `just audit` in `mobile/`.
- [ ] Every `uses:` is pinned to a commit SHA with a version comment.

**Verify:**
- `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/security.yml'))"` → no output, exit 0.
- `betterleaks git --no-banner` from repo root → `INF no leaks found`, exit 0 (confirms the exact CI command works on this tree).
- `betterleaks version` → `1.3.1` (confirms the pinned version matches local).

**Steps:**

- [ ] **Step 1: Confirm the pinned facts (already resolved — do not guess)**

These are verified against the betterleaks v1.3.1 release and the existing workflows; use them verbatim:

- betterleaks asset: `betterleaks_1.3.1_linux_x64.tar.gz`
- betterleaks SHA256: `7b241c80204538cbb210c94514dc7cdff86430938bd7d5b6e289207959530849`
- tarball contains a bare `betterleaks` binary (plus LICENSE/README)
- `actions/checkout` → `de0fac2e4500dabe0009e67214ff5f5447ce83dd` # v6.0.2
- `actions/setup-go` → `4a3601121dd01d1626a1e23e37211e3254c1c06c` # v6.4.0
- `extractions/setup-just` → `53165ef7e734c5c07cb06b3c8e7b647c5aa16db3` # v4
- osv-scanner binary URL + SHA256 copied exactly from `mobile.yml`'s install step.

If you want to re-verify the betterleaks checksum independently:

```bash
curl -sSL "https://github.com/betterleaks/betterleaks/releases/download/v1.3.1/checksums.txt" | grep linux_x64
# expect: 7b241c80204538cbb210c94514dc7cdff86430938bd7d5b6e289207959530849  betterleaks_1.3.1_linux_x64.tar.gz
```

- [ ] **Step 2: Write `.github/workflows/security.yml`**

```yaml
name: security

# Repo-wide security gate. Secret scanning runs on every push/PR (no path
# filter — secrets are not component-scoped); the dependency re-audits run on a
# weekly cron so a CVE disclosed against an unchanged dep still surfaces. The
# per-component security jobs in backend.yml / mobile.yml are unchanged.
on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: "0 6 * * 1" # Mondays 06:00 UTC

permissions:
  contents: read

concurrency:
  group: security-${{ github.ref }}
  cancel-in-progress: true

jobs:
  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          fetch-depth: 0 # full history — required for a history-wide scan

      - name: Install betterleaks (pinned + checksum-verified)
        run: |
          curl -sSL -o betterleaks.tar.gz "https://github.com/betterleaks/betterleaks/releases/download/v1.3.1/betterleaks_1.3.1_linux_x64.tar.gz"
          echo "7b241c80204538cbb210c94514dc7cdff86430938bd7d5b6e289207959530849  betterleaks.tar.gz" | sha256sum -c -
          tar -xzf betterleaks.tar.gz betterleaks
          chmod +x betterleaks
          sudo mv betterleaks /usr/local/bin/

      - name: Secret scan (full history)
        run: betterleaks git --no-banner

  backend-audit:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

      - uses: actions/setup-go@4a3601121dd01d1626a1e23e37211e3254c1c06c # v6.4.0
        with:
          go-version-file: backend/go.mod
          cache-dependency-path: backend/go.sum

      - uses: extractions/setup-just@53165ef7e734c5c07cb06b3c8e7b647c5aa16db3 # v4

      - name: Dependency + static audit (govulncheck + gosec)
        run: just audit

  mobile-audit:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: mobile
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

      - uses: extractions/setup-just@53165ef7e734c5c07cb06b3c8e7b647c5aa16db3 # v4

      - name: Install osv-scanner (pinned + checksum-verified)
        run: |
          curl -sSL -o osv-scanner "https://github.com/google/osv-scanner/releases/download/v2.3.8/osv-scanner_linux_amd64"
          echo "bc98e15319ed0d515e3f9235287ba53cdc5535d576d24fd573978ecfe9ab92dc  osv-scanner" | sha256sum -c -
          chmod +x osv-scanner
          sudo mv osv-scanner /usr/local/bin/

      - name: Dependency audit (osv-scanner)
        run: just audit
```

- [ ] **Step 3: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/security.yml')); print('ok')"`
Expected: `ok` (exit 0). If `actionlint` is installed, also run `actionlint .github/workflows/security.yml` and expect no errors.

- [ ] **Step 4: Confirm the secret-scan command works on this tree**

Run: `betterleaks git --no-banner`
Expected: log line `INF no leaks found`, exit 0. (This is the exact command the `secrets` job runs.)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/security.yml
git commit -m "feat: add CI secret scan + weekly scheduled dependency re-audit"
```

(The lefthook pre-commit betterleaks scan will also run here and must pass.)
