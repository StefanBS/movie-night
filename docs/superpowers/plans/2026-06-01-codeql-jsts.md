# CodeQL JS/TS SAST Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `.github/workflows/codeql.yml` running CodeQL analysis for the mobile JavaScript/TypeScript code, with results in the code-scanning Security tab.

**Architecture:** One CodeQL `analyze` job scoped to `javascript-typescript`; no `npm ci`/autobuild (interpreted language, source extracted directly); push/PR/weekly-schedule triggers with no path filter; actions pinned to the same SHA already used for `upload-sarif`.

**Tech Stack:** GitHub Actions; `github/codeql-action/{init,analyze}@84498526a009a99c875e83ef4821a8ba52de7c22` (codeql-bundle-v2.25.5).

**Spec:** `docs/superpowers/specs/2026-06-01-codeql-jsts-design.md`

**Branch:** `feat/ci-security-gate`.

---

### Task 1: Add `.github/workflows/codeql.yml`

**Goal:** Create the CodeQL workflow analyzing JS/TS and uploading to code scanning.

**Files:**
- Create: `.github/workflows/codeql.yml`
- Reference only (do NOT modify): existing workflows for the pinned `actions/checkout` SHA and the codeql-action SHA.

**Acceptance Criteria:**
- [ ] Triggers: `push` to `main`, `pull_request` (no path filter), `schedule` cron `0 6 * * 1`.
- [ ] Top-level `permissions: contents: read`; `concurrency` group `codeql-${{ github.ref }}`.
- [ ] `analyze` job with job-level `permissions`: `contents: read`, `security-events: write`, `actions: read`.
- [ ] Steps: checkout → `codeql-action/init` (`languages: javascript-typescript`) → `codeql-action/analyze` (`category: "/language:javascript-typescript"`). No npm/build step.
- [ ] All `uses:` pinned to commit SHAs (checkout `de0fac2e…`; codeql-action `84498526…`).

**Verify:**
- `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/codeql.yml')); print('yaml ok')"` → `yaml ok`.
- `grep -c "84498526a009a99c875e83ef4821a8ba52de7c22" .github/workflows/codeql.yml` → `2`.
- `grep -q "languages: javascript-typescript" .github/workflows/codeql.yml && echo lang-ok` → `lang-ok`.

**Steps:**

- [ ] **Step 1: Create `.github/workflows/codeql.yml`**

```yaml
name: codeql

# CodeQL static analysis for the mobile JS/TS code. No path filter so the check
# always reports (safe to require in branch protection). Backend Go SAST is
# covered by gosec, so CodeQL is scoped to javascript-typescript only.
on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: "0 6 * * 1" # Mondays 06:00 UTC

permissions:
  contents: read

concurrency:
  group: codeql-${{ github.ref }}
  cancel-in-progress: true

jobs:
  analyze:
    name: analyze
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
      actions: read
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

      # JS/TS is interpreted — no npm install or autobuild step; CodeQL extracts
      # source directly.
      - name: Initialize CodeQL
        uses: github/codeql-action/init@84498526a009a99c875e83ef4821a8ba52de7c22 # codeql-bundle-v2.25.5
        with:
          languages: javascript-typescript

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@84498526a009a99c875e83ef4821a8ba52de7c22 # codeql-bundle-v2.25.5
        with:
          category: "/language:javascript-typescript"
```

- [ ] **Step 2: Validate**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/codeql.yml')); print('yaml ok')"
grep -c "84498526a009a99c875e83ef4821a8ba52de7c22" .github/workflows/codeql.yml   # expect 2
grep -q "languages: javascript-typescript" .github/workflows/codeql.yml && echo lang-ok
```
Expected: `yaml ok`, `2`, `lang-ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/codeql.yml
git commit -m "feat: add CodeQL JS/TS static analysis"
```
(The lefthook pre-commit betterleaks scan runs and must pass.)
