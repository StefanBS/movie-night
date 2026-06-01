# Dependabot config — design

**Date:** 2026-06-01
**Status:** Approved, implementing
**Branch:** `feat/ci-security-gate` (same PR as the rest of the security gate)

## Problem

The security scanners *detect* vulnerable/outdated dependencies but nothing
*remediates* them — upgrades are fully manual ("detect but don't remediate").
Now that the repo is public, Dependabot (alerts + automated update PRs) is free.
This adds the config so dependency bumps arrive as reviewable PRs that the
existing CI gate + code scanning then vet.

## Scope

In: a single `.github/dependabot.yml` covering three ecosystems with grouped
weekly update PRs and an Expo-SDK-54-safe ignore rule.

Out (settings, not code — done in the GitHub UI, not this file):
- Enabling Dependabot **alerts** and **security updates** (repo Settings → Code
  security). The config file drives *version* updates; alerts/security-updates
  are a separate toggle.
- Native secret scanning + push protection.
- Branch protection requiring the security checks.

## Design

`.github/dependabot.yml`, schema `version: 2`, three `updates` entries. All run
`schedule: weekly` on Monday (aligns with the Mon 06:00 UTC security cron). Each
has a `groups` block so each ecosystem produces **one grouped PR per week**
instead of many.

1. **gomod** — `directory: /backend`. Group all updates (`patterns: ["*"]`).
   Covers module `require` deps and the `tool` deps (gosec, govulncheck, goose,
   sqlc).
2. **npm** — `directory: /mobile`. Group all updates, plus an `ignore` block that
   drops `version-update:semver-major` for the eight SDK-coupled packages:
   `expo`, `react-native`, `react`, `react-dom`, `expo-constants`,
   `expo-status-bar`, `react-native-safe-area-context`, `react-native-web`.
   Patch/minor within SDK 54 still flow; a pin-breaking major is never proposed.
   (Security-advisory updates are unaffected by `ignore`.)
3. **github-actions** — `directory: /` (Dependabot scans `.github/workflows`).
   Group all updates. Dependabot updates the pinned SHA and the `# vX` version
   comment together, preserving the repo's SHA-pinning convention.

A header comment documents the Expo-pin rationale so the `ignore` block is not
deleted by a future reader. `open-pull-requests-limit` is left at the default.

## Verification

- `.github/dependabot.yml` is valid YAML and structurally matches Dependabot v2
  (two `updates` ecosystems use `groups`; the npm entry carries the eight-package
  major-ignore). GitHub fully validates the schema on push and surfaces errors in
  the Dependabot tab.
- After merge + enabling alerts/security-updates in Settings, the Dependabot tab
  lists the three ecosystems and the first weekly run opens grouped PRs.

## Future (not now)

Tune grouping (e.g. split patch vs minor) if weekly PRs prove noisy; add a
`commit-message` prefix convention if desired.
