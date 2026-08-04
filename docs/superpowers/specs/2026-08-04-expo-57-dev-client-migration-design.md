# Expo 57 + local development builds — design

**Date:** 2026-08-04  
**Status:** Implemented  
**Branch:** `feat/expo-57-dev-client`

## Problem

Phone testing has been tied to **Expo Go**, which lags store releases and
blocks SDK jumps (Android Expo Go currently tops out at SDK 56). The project
already proved a **local development build** path (`expo-dev-client` +
`npx expo run:android`). Docs and `just` recipes still describe Expo Go as the
primary workflow, and agent guidance still points at SDK 56 docs.

## Goals

1. Make **local Android development builds** the default documented workflow.
2. Upgrade the mobile app to **Expo SDK 57** (latest as of this design).
3. Update `mobile/justfile`, active docs (`mobile/README.md`, `mobile/AGENTS.md`,
   root `CLAUDE.md`), and Dependabot comments so they match that workflow.
4. Keep Continuous Native Generation: `android/` / `ios/` stay gitignored, with
   explicit recovery recipes.

## Non-goals

- Committing generated `android/` or `ios/` trees.
- Making EAS Build the default install path (keep as optional backup only).
- Rewriting historical `docs/superpowers/plans|specs` that mention SDK 56.
- Expanding iOS physical-device workflow beyond existing `just ios` / macOS notes.
- Dropping Dependabot major holds on `eslint` / `@types/node`.

## Decisions

| Topic | Choice |
| --- | --- |
| Default Android install | Local: `npx expo run:android` via `just android` |
| Day-to-day JS | Metro (`just start` / `just start-clean`) into the installed **dev client** |
| Native folders | CNG — gitignored; regenerate on demand |
| Recovery | Explicit `just prebuild` and/or `just android-clean` |
| EAS | Keep `eas.json` + project id; document as optional backup, not primary |
| SDK | Expo SDK 57 |
| Dependabot | Keep `eslint` and `@types/node` major ignores; refresh comments for SDK 57 / Node 22 |

## Design

### Runtime / dependencies

- Bump with `npx expo install expo@^57.0.0 --fix` so Expo-coupled packages
  (`expo-dev-client`, expo-router, babel-preset-expo, eslint-config-expo, …)
  align with SDK 57.
- Run `npx expo-doctor@latest` and `npx expo install --check`; fix reported
  mismatches.
- Require `expo-dev-client` (already present from the exploratory setup).
- Keep Node **22** for mobile scripts/tests; note 22.13+ if doctor requires it.
- After the SDK bump, delete any local `android/` generated under SDK 56 and
  rebuild (SDK 57 `prebuild` cleans by default).

### Justfile (`mobile/justfile`)

Recipes (names may be adjusted slightly in the plan, behavior fixed):

| Recipe | Behavior |
| --- | --- |
| `start` / `start-clean` | Metro as today; targets the dev client when `expo-dev-client` is installed |
| `android` | `npx expo run:android` — build/install debug app + start Metro |
| `android-clean` | Remove `android/`, then `expo run:android` (or prebuild + run) |
| `prebuild` | `npx expo prebuild --platform android` (CNG regenerate) |
| `ios` / `web` | Unchanged intent; docs note macOS for iOS |

Do **not** add first-class EAS recipes in this change. Env prerequisites
(`ANDROID_HOME`, `JAVA_HOME` pointing at Android Studio’s JBR or a real JDK 21)
are documented in README, not hard-coded into recipes (paths differ per machine).

### Documentation

**`mobile/README.md`**
- Stack line: Expo SDK 57.
- Prerequisites: Android SDK, JDK 21 (Studio JBR ok), adb, physical device or
  emulator; link SDK 57 docs.
- Run section: install/rebuild with `just android`; day-to-day with `just start`
  and the installed app. Expo Go is not the supported phone path.
- Short “optional: EAS development build” note for cloud APK when local native
  toolchain is unavailable.
- Troubleshooting: stale Metro (`start-clean`), missing/corrupt NDK (delete
  incomplete `ndk/<version>` under the SDK and rebuild), `JAVA_HOME` must be a
  real JDK directory (not an empty Fedora stub).

**`mobile/AGENTS.md`**
- Point at https://docs.expo.dev/versions/v57.0.0/ (or current SDK 57 docs URL).

**Root `CLAUDE.md`**
- Mobile section: SDK 57; local/dev-client workflow; drop Expo Go sideload as the
  primary gotcha.
- Keep the `@types/node` / `"types": ["node"]` / Node 22 typecheck note; refresh
  wording if needed for SDK 57.

### Dependabot

In `.github/dependabot.yml`, keep:

- `eslint` — ignore `semver-major`
- `@types/node` — ignore `semver-major`

Update the comment to say these are deliberate holds tied to **eslint-config-expo
@ SDK 57** and the **Node 22** runtime — not Expo Go. Do not restore the old
eight-package Expo SDK pin ignore block.

### Git / branch hygiene

- Work on `feat/expo-57-dev-client`.
- Include exploratory mobile changes that belong to this migration
  (`expo-dev-client`, `eas.json`, related `app.json` / lockfile updates).
- Leave unrelated untracked trees (e.g. `design_handoff_app_redesign/`, root
  `package-lock.json`) out of this branch’s commits.

## Verification

- `cd mobile && just check` (lint + typecheck + test) passes on SDK 57.
- `npx expo-doctor@latest` reports no blocking issues (or only documented
  accepted warnings).
- Docs and justfile describe local/dev-client as primary; no “use Expo Go for
  SDK 56” primary path remains in active docs listed above.
- Dependabot comment matches the kept ignores.
- Manual smoke (developer machine): `just android` installs/launches on a
  connected device; JS reload works via Metro without Expo Go.

## Approach

Single migration PR (workflow + SDK 57 + docs together) so tooling and
documentation match the SDK that requires leaving Expo Go.
