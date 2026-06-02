# Code Scanning (SARIF → Security tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit SARIF from all four scanners (govulncheck, gosec, osv-scanner, betterleaks) and upload it to the GitHub code-scanning Security tab from both PR/push and scheduled jobs, without changing the existing build gate.

**Architecture:** New `audit-sarif` `just` recipes produce SARIF files (exit 0, no gating). Each scanning job follows: produce SARIF → upload via pinned `github/codeql-action/upload-sarif` (per-file `category`, fork-PR guarded) → run the existing text recipe last to gate. Tools run twice (SARIF + gate); deliberate on this tiny codebase to keep the gate untouched and dependency-free.

**Tech Stack:** GitHub Actions; `github/codeql-action/upload-sarif@84498526a009a99c875e83ef4821a8ba52de7c22` (codeql-bundle-v2.25.5); govulncheck/gosec/osv-scanner/betterleaks SARIF modes; `just`.

**Spec:** `docs/superpowers/specs/2026-06-01-code-scanning-sarif-design.md`

**Verified facts (do not re-derive):**
- `go tool govulncheck -format sarif ./...` → SARIF to stdout, **always exit 0**.
- `go tool gosec -exclude-generated -fmt sarif -out gosec.sarif ./...` → writes file; exits non-zero only on findings.
- `osv-scanner scan source ... --format sarif` → SARIF to **stdout** (no `--output` flag); exits non-zero on vulns.
- `betterleaks git --no-banner --report-format sarif --report-path FILE --exit-code 0` → writes file, **forced exit 0**.
- `upload-sarif`'s `sarif_file:` is resolved from the **workspace root**, not a job's `working-directory`. Recipes run in `backend/`/`mobile/`, so files land there → reference `backend/…sarif` / `mobile/…sarif`.
- Fork-PR guard: `if: github.event.pull_request.head.repo.fork != true` (true on push/schedule and same-repo PRs; false only on fork PRs).

---

### Task 1: Add `audit-sarif` recipes to backend & mobile justfiles

**Goal:** Recipes that emit SARIF for every scanner and always exit 0.

**Files:**
- Modify: `backend/justfile` (append after the existing `audit` recipe, before `run`)
- Modify: `mobile/justfile` (append after the existing `audit` recipe)

**Acceptance Criteria:**
- [ ] `backend/justfile` has `audit-sarif` writing `govulncheck.sarif` + `gosec.sarif`, exiting 0.
- [ ] `mobile/justfile` has `audit-sarif` writing `osv-scanner.sarif`, exiting 0.
- [ ] Existing `vuln`/`sast`/`audit` recipes are byte-for-byte unchanged.

**Verify:**
- `cd backend && just audit-sarif && echo "exit=$?" && python3 -c "import json; json.load(open('govulncheck.sarif')); json.load(open('gosec.sarif')); print('backend sarif ok')"` → `exit=0`, `backend sarif ok`.
- (mobile osv-scanner is not installed locally; verify the recipe text only — CI exercises it.)

**Steps:**

- [ ] **Step 1: Add the backend recipe**

In `backend/justfile`, insert these lines immediately after the existing `audit: vuln sast` recipe (and its blank line), before the `# Run the backend server` / `run:` recipe:

```just
# Emit SARIF for code-scanning upload (does NOT gate — `just audit` gates)
audit-sarif:
    -go tool govulncheck -format sarif ./... > govulncheck.sarif
    -go tool gosec -exclude-generated -fmt sarif -out gosec.sarif ./...
```

The leading `-` is just's ignore-exit-code prefix, so a non-zero scan (findings) does not fail the recipe; govulncheck's SARIF mode already exits 0.

- [ ] **Step 2: Add the mobile recipe**

In `mobile/justfile`, append after the existing `audit:` recipe:

```just
# Emit SARIF for code-scanning upload (does NOT gate — `just audit` gates)
audit-sarif:
    -osv-scanner scan source --lockfile=package-lock.json --config=osv-scanner.toml --format sarif > osv-scanner.sarif
```

osv-scanner writes SARIF to stdout (logs go to stderr), so it is redirected to the file; the `-` prefix swallows its non-zero exit on findings.

- [ ] **Step 3: Verify backend recipe runs and produces valid SARIF**

Run:
```bash
cd backend && just audit-sarif && echo "exit=$?" && python3 -c "import json; json.load(open('govulncheck.sarif')); json.load(open('gosec.sarif')); print('backend sarif ok')"
```
Expected: recipe completes, `exit=0`, `backend sarif ok`. Then clean up the generated files so they are not committed: `rm -f govulncheck.sarif gosec.sarif`.

- [ ] **Step 4: Ignore generated SARIF files**

Add a line to `.gitignore` at the repo root (create the file if absent) so SARIF artifacts are never committed:

```gitignore
*.sarif
```

- [ ] **Step 5: Commit**

```bash
git add backend/justfile mobile/justfile .gitignore
git commit -m "feat: add audit-sarif recipes emitting SARIF for code scanning"
```

---

### Task 2: Wire SARIF upload into PR/push jobs (backend.yml, mobile.yml)

**Goal:** The per-component PR/push security jobs upload SARIF (diff-aware alerts) while keeping their exit-code gate.

**Files:**
- Modify: `.github/workflows/backend.yml` (the `security` job)
- Modify: `.github/workflows/mobile.yml` (the `audit` job)

**Acceptance Criteria:**
- [ ] Each job has job-level `permissions: { contents: read, security-events: write }`.
- [ ] Step order: produce SARIF (`just audit-sarif`) → upload (per file) → gate (`just audit`).
- [ ] Every upload uses the pinned codeql-action SHA, a `category`, and the fork guard.
- [ ] `sarif_file` paths are workspace-root-relative (`backend/…`, `mobile/…`).

**Verify:** `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/backend.yml')); yaml.safe_load(open('.github/workflows/mobile.yml')); print('ok')"` → `ok`. Grep confirms the pinned SHA and fork guard appear on each upload.

**Steps:**

- [ ] **Step 1: Replace the backend `security` job**

In `.github/workflows/backend.yml`, replace the entire `security:` job (from `  security:` through its final `run: just audit` step) with:

```yaml
  security:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
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

      - name: Generate SARIF (does not gate)
        run: just audit-sarif

      - name: Upload govulncheck SARIF
        if: github.event.pull_request.head.repo.fork != true
        uses: github/codeql-action/upload-sarif@84498526a009a99c875e83ef4821a8ba52de7c22 # codeql-bundle-v2.25.5
        with:
          sarif_file: backend/govulncheck.sarif
          category: govulncheck

      - name: Upload gosec SARIF
        if: github.event.pull_request.head.repo.fork != true
        uses: github/codeql-action/upload-sarif@84498526a009a99c875e83ef4821a8ba52de7c22 # codeql-bundle-v2.25.5
        with:
          sarif_file: backend/gosec.sarif
          category: gosec

      - name: Security audit (govulncheck + gosec)
        run: just audit
```

- [ ] **Step 2: Replace the mobile `audit` job**

In `.github/workflows/mobile.yml`, replace the entire `audit:` job with (note the osv-scanner install step is unchanged — keep its existing pinned binary block):

```yaml
  audit:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    defaults:
      run:
        working-directory: mobile
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

      - uses: extractions/setup-just@53165ef7e734c5c07cb06b3c8e7b647c5aa16db3 # v4

      - name: Install osv-scanner (pinned + checksum-verified)
        run: |
          curl -fsSL -o osv-scanner "https://github.com/google/osv-scanner/releases/download/v2.3.8/osv-scanner_linux_amd64"
          echo "bc98e15319ed0d515e3f9235287ba53cdc5535d576d24fd573978ecfe9ab92dc  osv-scanner" | sha256sum -c -
          chmod +x osv-scanner
          sudo mv osv-scanner /usr/local/bin/

      - name: Generate SARIF (does not gate)
        run: just audit-sarif

      - name: Upload osv-scanner SARIF
        if: github.event.pull_request.head.repo.fork != true
        uses: github/codeql-action/upload-sarif@84498526a009a99c875e83ef4821a8ba52de7c22 # codeql-bundle-v2.25.5
        with:
          sarif_file: mobile/osv-scanner.sarif
          category: osv-scanner

      - name: Dependency audit (osv-scanner)
        run: just audit
```

- [ ] **Step 3: Validate YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/backend.yml')); yaml.safe_load(open('.github/workflows/mobile.yml')); print('ok')"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/backend.yml .github/workflows/mobile.yml
git commit -m "feat: upload SARIF to code scanning from PR/push security jobs"
```

---

### Task 3: Wire SARIF into security.yml (secrets + scheduled audits)

**Goal:** All three `security.yml` jobs upload SARIF: betterleaks (push/PR/schedule) and the scheduled backend/mobile audits.

**Files:**
- Modify: `.github/workflows/security.yml` (all three jobs)

**Acceptance Criteria:**
- [ ] Each job has job-level `permissions: { contents: read, security-events: write }`.
- [ ] `secrets`: betterleaks SARIF (forced exit 0) → upload (category `betterleaks`) → gate.
- [ ] `backend-audit` / `mobile-audit`: `just audit-sarif` → upload(s) → `just audit` gate.
- [ ] All uploads use the pinned SHA, a category, and the fork guard.

**Verify:** `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/security.yml')); print('ok')"` → `ok`; and `betterleaks git --no-banner --report-format sarif --report-path /tmp/bl.sarif --exit-code 0 && python3 -c "import json; json.load(open('/tmp/bl.sarif')); print('bl sarif ok')"` → `bl sarif ok`.

**Steps:**

- [ ] **Step 1: Replace `security.yml` in full**

Replace the entire file with (the `fetch-depth`, cron, betterleaks install, and osv-scanner install blocks are unchanged from the current file — only permissions, SARIF-produce, and upload steps are added):

```yaml
name: security

# Repo-wide security gate. Secret scanning runs on every push/PR (no path
# filter — secrets are not component-scoped); the dependency re-audits run on a
# weekly cron so a CVE disclosed against an unchanged dep still surfaces. The
# per-component security jobs in backend.yml / mobile.yml are unchanged.
# Each job emits SARIF and uploads it to the code-scanning Security tab.
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
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          fetch-depth: 0 # full history — required for a history-wide scan

      - name: Install betterleaks (pinned + checksum-verified)
        run: |
          curl -fsSL -o betterleaks.tar.gz "https://github.com/betterleaks/betterleaks/releases/download/v1.3.1/betterleaks_1.3.1_linux_x64.tar.gz"
          echo "7b241c80204538cbb210c94514dc7cdff86430938bd7d5b6e289207959530849  betterleaks.tar.gz" | sha256sum -c -
          tar -xzf betterleaks.tar.gz betterleaks
          chmod +x betterleaks
          sudo mv betterleaks /usr/local/bin/

      - name: Generate SARIF (does not gate)
        run: betterleaks git --no-banner --report-format sarif --report-path betterleaks.sarif --exit-code 0

      - name: Upload betterleaks SARIF
        if: github.event.pull_request.head.repo.fork != true
        uses: github/codeql-action/upload-sarif@84498526a009a99c875e83ef4821a8ba52de7c22 # codeql-bundle-v2.25.5
        with:
          sarif_file: betterleaks.sarif
          category: betterleaks

      - name: Secret scan (full history)
        run: betterleaks git --no-banner

  backend-audit:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
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

      - name: Generate SARIF (does not gate)
        run: just audit-sarif

      - name: Upload govulncheck SARIF
        if: github.event.pull_request.head.repo.fork != true
        uses: github/codeql-action/upload-sarif@84498526a009a99c875e83ef4821a8ba52de7c22 # codeql-bundle-v2.25.5
        with:
          sarif_file: backend/govulncheck.sarif
          category: govulncheck

      - name: Upload gosec SARIF
        if: github.event.pull_request.head.repo.fork != true
        uses: github/codeql-action/upload-sarif@84498526a009a99c875e83ef4821a8ba52de7c22 # codeql-bundle-v2.25.5
        with:
          sarif_file: backend/gosec.sarif
          category: gosec

      - name: Dependency + static audit (govulncheck + gosec)
        run: just audit

  mobile-audit:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    defaults:
      run:
        working-directory: mobile
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

      - uses: extractions/setup-just@53165ef7e734c5c07cb06b3c8e7b647c5aa16db3 # v4

      - name: Install osv-scanner (pinned + checksum-verified)
        run: |
          curl -fsSL -o osv-scanner "https://github.com/google/osv-scanner/releases/download/v2.3.8/osv-scanner_linux_amd64"
          echo "bc98e15319ed0d515e3f9235287ba53cdc5535d576d24fd573978ecfe9ab92dc  osv-scanner" | sha256sum -c -
          chmod +x osv-scanner
          sudo mv osv-scanner /usr/local/bin/

      - name: Generate SARIF (does not gate)
        run: just audit-sarif

      - name: Upload osv-scanner SARIF
        if: github.event.pull_request.head.repo.fork != true
        uses: github/codeql-action/upload-sarif@84498526a009a99c875e83ef4821a8ba52de7c22 # codeql-bundle-v2.25.5
        with:
          sarif_file: mobile/osv-scanner.sarif
          category: osv-scanner

      - name: Dependency audit (osv-scanner)
        run: just audit
```

- [ ] **Step 2: Validate YAML + betterleaks SARIF locally**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/security.yml')); print('yaml ok')"
betterleaks git --no-banner --report-format sarif --report-path /tmp/bl.sarif --exit-code 0 && python3 -c "import json; json.load(open('/tmp/bl.sarif')); print('bl sarif ok')"
```
Expected: `yaml ok` then `bl sarif ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/security.yml
git commit -m "feat: upload SARIF to code scanning from secrets + scheduled audit jobs"
```
(The lefthook pre-commit betterleaks scan runs and must pass.)
