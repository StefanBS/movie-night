# Dependabot Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `.github/dependabot.yml` so Dependabot opens grouped weekly dependency-update PRs for Go, npm, and GitHub Actions, without ever proposing a bump that breaks the deliberate Expo SDK 54 pin.

**Architecture:** A single Dependabot v2 config with three `updates` entries (gomod `/backend`, npm `/mobile`, github-actions `/`), each grouped into one weekly PR; the npm entry carries an `ignore` block dropping major-version bumps for the eight SDK-coupled packages.

**Tech Stack:** GitHub Dependabot (config v2). No code, no tests beyond YAML/structure validation; GitHub validates the full schema on push.

**Spec:** `docs/superpowers/specs/2026-06-01-dependabot-design.md`

**Branch:** `feat/ci-security-gate` (stays in the existing security-gate PR).

---

### Task 1: Add `.github/dependabot.yml`

**Goal:** Create the Dependabot config covering all three ecosystems with grouping and the Expo-pin-safe ignore rule.

**Files:**
- Create: `.github/dependabot.yml`

**Acceptance Criteria:**
- [ ] `version: 2` with three `updates`: gomod `/backend`, npm `/mobile`, github-actions `/`.
- [ ] Every entry is `schedule.interval: weekly`, `day: monday`, with a `groups` block (`patterns: ["*"]`).
- [ ] The npm entry has an `ignore` block dropping `version-update:semver-major` for exactly these eight packages: `expo`, `react-native`, `react`, `react-dom`, `expo-constants`, `expo-status-bar`, `react-native-safe-area-context`, `react-native-web`.
- [ ] A header comment documents the Expo-pin rationale.

**Verify:**
- `python3 -c "import yaml; d=yaml.safe_load(open('.github/dependabot.yml')); assert d['version']==2; ecos=[u['package-ecosystem'] for u in d['updates']]; assert ecos==['gomod','npm','github-actions'], ecos; npm=[u for u in d['updates'] if u['package-ecosystem']=='npm'][0]; assert len(npm['ignore'])==8; assert all(i['update-types']==['version-update:semver-major'] for i in npm['ignore']); assert all('groups' in u for u in d['updates']); print('dependabot config ok')"` → `dependabot config ok`.

**Steps:**

- [ ] **Step 1: Create `.github/dependabot.yml`**

```yaml
# Dependabot opens dependency-update PRs that the existing CI gate + code
# scanning then vet. Updates are grouped into one PR per ecosystem per week.
#
# The npm `ignore` block protects the deliberate Expo SDK 54 pin
# (see mobile/AGENTS.md): it drops MAJOR-version bumps for the SDK-coupled
# packages only — patch/minor within SDK 54 still flow, and security-advisory
# updates are unaffected. Do NOT remove it; a major bump of the Expo / React
# Native family would break the pin.
version: 2
updates:
  - package-ecosystem: gomod
    directory: /backend
    schedule:
      interval: weekly
      day: monday
    groups:
      backend:
        patterns:
          - "*"

  - package-ecosystem: npm
    directory: /mobile
    schedule:
      interval: weekly
      day: monday
    groups:
      mobile:
        patterns:
          - "*"
    ignore:
      - dependency-name: expo
        update-types: ["version-update:semver-major"]
      - dependency-name: react-native
        update-types: ["version-update:semver-major"]
      - dependency-name: react
        update-types: ["version-update:semver-major"]
      - dependency-name: react-dom
        update-types: ["version-update:semver-major"]
      - dependency-name: expo-constants
        update-types: ["version-update:semver-major"]
      - dependency-name: expo-status-bar
        update-types: ["version-update:semver-major"]
      - dependency-name: react-native-safe-area-context
        update-types: ["version-update:semver-major"]
      - dependency-name: react-native-web
        update-types: ["version-update:semver-major"]

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
    groups:
      actions:
        patterns:
          - "*"
```

- [ ] **Step 2: Validate structure**

Run:
```bash
python3 -c "import yaml; d=yaml.safe_load(open('.github/dependabot.yml')); assert d['version']==2; ecos=[u['package-ecosystem'] for u in d['updates']]; assert ecos==['gomod','npm','github-actions'], ecos; npm=[u for u in d['updates'] if u['package-ecosystem']=='npm'][0]; assert len(npm['ignore'])==8; assert all(i['update-types']==['version-update:semver-major'] for i in npm['ignore']); assert all('groups' in u for u in d['updates']); print('dependabot config ok')"
```
Expected: `dependabot config ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "feat: add Dependabot config (Go + npm + Actions, Expo-pin safe)"
```
(The lefthook pre-commit betterleaks scan runs and must pass.)
