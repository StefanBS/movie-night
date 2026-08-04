# Expo 57 + local development builds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate mobile development from Expo Go to local Android development builds, upgrade to Expo SDK 57, and update justfile + active docs + Dependabot comments to match.

**Architecture:** Keep Continuous Native Generation (`android/` / `ios/` gitignored). `expo-dev-client` + `npx expo run:android` is the primary phone path; Metro handles day-to-day JS. EAS remains configured as an optional backup. Single PR on `feat/expo-57-dev-client`.

**Tech Stack:** Expo SDK 57, expo-dev-client, expo-router, React Native (SDK 57-aligned), Node 22, just, EAS config (optional).

**Spec:** `docs/superpowers/specs/2026-08-04-expo-57-dev-client-migration-design.md`

## Global Constraints

- Default Android install path is **local** `npx expo run:android` / `just android` — not Expo Go, not EAS-first.
- Keep `/android` and `/ios` **gitignored** (CNG); never commit generated native trees.
- Keep Dependabot major ignores for `eslint` and `@types/node`; only refresh comments for SDK 57 / Node 22.
- Do **not** commit `design_handoff_app_redesign/` or root `package-lock.json`.
- Do **not** rewrite historical `docs/superpowers/plans|specs` that mention SDK 56.
- Env paths (`JAVA_HOME`, `ANDROID_HOME`) are documented in README, not hard-coded into just recipes.
- Node stays on major **22**.

## File map

| File | Responsibility |
| --- | --- |
| `mobile/package.json` + lockfile | SDK 57 deps; `android`/`ios` scripts use `expo run:*`; `expo-dev-client` required |
| `mobile/app.json` | Android `package`, EAS `projectId` under `extra.eas` |
| `mobile/eas.json` | Optional EAS profiles (`developmentClient: true` on `development`) |
| `mobile/justfile` | `android`, `android-clean`, `prebuild`, existing start/check recipes |
| `mobile/README.md` | Local/dev-client primary workflow + troubleshooting |
| `mobile/AGENTS.md` | SDK 57 docs URL for agents |
| `CLAUDE.md` | Root agent guidance: SDK 57, local builds, drop Expo Go sideload gotcha |
| `.github/dependabot.yml` | Comment refresh only for existing ignores |

---

### Task 1: Commit exploratory foundation (dev-client + EAS wiring on current SDK)

**Files:**
- Modify: `mobile/package.json` (already has `expo-dev-client`, `expo run:android` / `expo run:ios` scripts)
- Modify: `mobile/package-lock.json`
- Modify: `mobile/app.json` (android `package`, `extra.eas.projectId`)
- Create: `mobile/eas.json`

**Interfaces:**
- Consumes: none
- Produces: committed baseline with `expo-dev-client` and EAS project wiring before the SDK 57 bump

- [ ] **Step 1: Confirm working-tree files belong to this migration**

Run from repo root:

```bash
git status -sb
git diff --stat mobile/package.json mobile/app.json mobile/eas.json
```

Expected: `mobile/eas.json` staged or untracked; `package.json` / `app.json` / lockfile modified; **no** `design_handoff_app_redesign/` or root `package-lock.json` staged.

Confirm `mobile/package.json` includes:

```json
"expo-dev-client": "~56.0.24"
```

(or whatever 56.x version is present before Task 2) and scripts:

```json
"android": "expo run:android",
"ios": "expo run:ios"
```

Confirm `mobile/app.json` has:

```json
"android": {
  "package": "com.drowsily1482.mobile"
},
"extra": {
  "eas": {
    "projectId": "9150d996-2532-46b9-82f5-2372ba03349a"
  }
}
```

Confirm `mobile/eas.json` exists with a `development` profile containing `"developmentClient": true`.

- [ ] **Step 2: Commit foundation only**

```bash
git add mobile/package.json mobile/package-lock.json mobile/app.json mobile/eas.json
git commit -m "$(cat <<'EOF'
Add expo-dev-client and EAS config for local Android builds.

EOF
)"
```

Expected: commit succeeds; unrelated untracked files remain unstaged.

---

### Task 2: Upgrade mobile to Expo SDK 57

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/package-lock.json`
- Possibly modify: other Expo-coupled package versions via `expo install --fix`

**Interfaces:**
- Consumes: Task 1 foundation (`expo-dev-client` present)
- Produces: `expo` at `^57` (and aligned Expo packages); doctor/check clean enough to proceed

- [ ] **Step 1: Upgrade Expo and aligned dependencies**

```bash
cd mobile
npx expo install expo@^57.0.0 --fix
```

Expected: `package.json` shows `"expo": "^57"` (or `~57.x.y`); Expo-related packages move to 57-compatible versions including `expo-dev-client`.

- [ ] **Step 2: Resolve remaining version mismatches**

```bash
npx expo install --check
npx expo-doctor@latest
```

Expected: no blocking doctor failures. If `--check` reports mismatches, apply the suggested `npx expo install <pkg>@...` fixes and re-run doctor.

If doctor requires Node ≥ 22.13, note that in the README prerequisites in Task 4 (do not bump Node major).

- [ ] **Step 3: Drop stale local native tree from SDK 56**

```bash
cd mobile
rm -rf android
```

Do **not** regenerate in this task; Task 3 / manual smoke will rebuild via CNG. Confirm `android/` is still listed in `mobile/.gitignore`.

- [ ] **Step 4: Run automated gates**

```bash
cd mobile
just check
```

Expected: lint + typecheck + test all pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/package.json mobile/package-lock.json
git commit -m "$(cat <<'EOF'
Upgrade mobile app to Expo SDK 57.

EOF
)"
```

If other files were changed by the upgrade tooling (e.g. `app.json` plugins), include them in the same commit after reviewing the diff.

---

### Task 3: Update `mobile/justfile` for CNG local builds

**Files:**
- Modify: `mobile/justfile`

**Interfaces:**
- Consumes: `package.json` scripts `android` → `expo run:android`, `ios` → `expo run:ios`
- Produces: `just android`, `just android-clean`, `just prebuild` matching the spec workflow table

- [ ] **Step 1: Replace the Android / prebuild section of `mobile/justfile`**

Keep existing `default`, `install`, `start`, `start-clean`, `ios`, `web`, `lint`, `typecheck`, `test`, `check`, `audit`, `audit-sarif` recipes. Update comments and Android-related recipes to:

```just
# Start the Metro dev server (connects to the installed dev client when present)
start:
    npm start

# Restart Metro with a cleared cache (fixes a phone stuck on a stale bundle)
start-clean:
    npx expo start -c

# Build/install the Android development client and start Metro
# Requires ANDROID_HOME, a JDK 21 (Android Studio JBR is fine), and adb device/emulator
android:
    npm run android

# Regenerate the Android native project (CNG; android/ is gitignored)
prebuild:
    npx expo prebuild --platform android

# Delete android/ and rebuild from scratch (use after SDK bumps or corrupt native/NDK installs)
android-clean:
    rm -rf android
    npm run android

# Launch on the iOS simulator (macOS only)
ios:
    npm run ios
```

- [ ] **Step 2: Verify recipes list**

```bash
cd mobile
just --list
```

Expected: output includes `android`, `android-clean`, `prebuild`, `start`, `start-clean`, `check`.

- [ ] **Step 3: Commit**

```bash
git add mobile/justfile
git commit -m "$(cat <<'EOF'
Add just recipes for local Android CNG builds.

EOF
)"
```

---

### Task 4: Update active documentation

**Files:**
- Modify: `mobile/AGENTS.md`
- Modify: `mobile/README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 3 recipe names (`android`, `android-clean`, `prebuild`, `start`, `start-clean`)
- Produces: docs that describe local/dev-client as primary; SDK 57 links; no Expo Go primary phone path

- [ ] **Step 1: Point agents at SDK 57 docs**

Replace entire contents of `mobile/AGENTS.md` with:

```markdown
# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.
```

- [ ] **Step 2: Rewrite Stack / Prerequisites / Run / Troubleshooting in `mobile/README.md`**

Update the **Stack** section to:

```markdown
## Stack

- **Expo SDK 57**
- **[expo-router](https://docs.expo.dev/router/introduction/)** — file-based navigation (`app/`)
- **[expo-dev-client](https://docs.expo.dev/develop/development-builds/introduction/)** — local development builds (not Expo Go)
- **React Native** / **React** — versions pinned by the Expo SDK 57 set
- **TypeScript 6.0**

Expo APIs are version-specific — read the
[SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/) before changing native or
Expo code (see [`AGENTS.md`](AGENTS.md)).
```

Replace the **Prerequisites** section with:

```markdown
## Prerequisites

- **Node.js 22+** and **npm** (use 22.13+ if `expo-doctor` requires it)
- **[just](https://github.com/casey/just)** (optional) — wraps the `npm`/`npx` recipes
- For Android device/emulator builds:
  - Android SDK (`ANDROID_HOME`, e.g. `~/Android/Sdk`)
  - JDK **21** with a real `JAVA_HOME` (Android Studio’s bundled JBR works; avoid empty distro stubs under `/usr/lib/jvm`)
  - `adb` and a device or emulator (`adb devices` shows `device`)
- The [backend](../backend) running and reachable

Native `android/` / `ios/` folders are **generated** (gitignored). First install or
SDK upgrades use `just android` / `just android-clean`.
```

Replace the **Run** section with:

```markdown
## Run

**First time / after native or SDK changes** (build + install the development client):

```bash
just android        # = npx expo run:android
```

**Day-to-day JS** (client already installed):

```bash
just start          # or: npm start
# or: just start-clean   # cleared Metro cache
```

Open the installed **Movie Night / mobile** app on the phone (not Expo Go) and
connect to the Metro bundler. Use `just ios` (macOS) or `just web` for those targets.

### Optional: EAS development build

If you cannot use a local Android toolchain, an EAS development profile is
configured in `eas.json`. Install EAS CLI (`npm install --global eas-cli` or
`npx eas-cli@latest`), then:

```bash
eas build --platform android --profile development
```

Install the resulting APK, then use `just start` as usual. Prefer local
`just android` when possible.
```

Extend **Troubleshooting** — keep the existing network / stale-Metro guidance, but change “re-scan the QR” to “reload in the dev client / restart Metro”, and add:

```markdown
**`JAVA_HOME is set to an invalid directory`** — point `JAVA_HOME` at a real JDK
21 home that contains `bin/java` (and ideally `bin/javac`). On this machine’s
typical layout: `export JAVA_HOME=$HOME/.local/opt/android-studio/jbr`.

**`NDK ... did not have a source.properties file`** — incomplete NDK install
(often after a disk-full failure). Remove the broken directory and rebuild:

```bash
rm -rf "$ANDROID_HOME/ndk/<version>"
just android-clean
```

**Corrupt / stale `android/` after an SDK bump:**

```bash
just android-clean
```
```

Leave Configuration, Connecting to the backend, Quality checks, Git hooks, and Project layout sections intact unless a line still claims Expo Go or SDK 56 — fix those lines if found.

- [ ] **Step 3: Update root `CLAUDE.md` mobile commands + gotchas**

In the **Commands** section, change the Mobile blurb from SDK 56 / Expo Go QR to:

```markdown
**Mobile** (Expo SDK 57, Node 22):
```bash
just android               # build/install the Android dev client + Metro
just start                 # Metro only (dev client already installed)
just start-clean           # = expo start -c — restart with cleared cache
just android-clean         # delete android/ and rebuild (CNG recovery)
just check                 # lint + typecheck + test
just lint | just typecheck | just test
node --import tsx --test lib/members.test.ts         # a single test file
```
```

Replace the Expo Go / SDK 56 gotcha bullet with:

```markdown
- **Mobile targets Expo SDK 57** and uses **local development builds** (`expo-dev-client`), not Expo Go, for physical Android testing. Rebuild the native client after SDK or native-dependency changes (`just android` or `just android-clean`). Before changing Expo/native code, read the exact versioned docs per [`mobile/AGENTS.md`](mobile/AGENTS.md): <https://docs.expo.dev/versions/v57.0.0/>.
- **Mobile typecheck needs `"types": ["node"]` in `mobile/tsconfig.json`** — TypeScript 6 (Expo SDK) no longer auto-includes `@types/node`, and the `lib/*.test.ts` files use `node:` built-ins (`node:test`, `Buffer`, …). Without it, `just typecheck` fails with TS2591 "Cannot find name 'node:test'". `@types/node` is pinned to the Node 22 runtime major.
```

Keep the stale-Metro network gotcha; change “re-scan the QR” to reconnect/reload via the installed dev client.

- [ ] **Step 4: Grep active docs for leftover Expo Go / SDK 56 primary guidance**

```bash
rg -n 'Expo Go|SDK 56|v56\.0\.0' mobile/README.md mobile/AGENTS.md CLAUDE.md
```

Expected: no remaining primary-path Expo Go or SDK 56 references in those three files (historical plans under `docs/superpowers/` are out of scope).

- [ ] **Step 5: Commit**

```bash
git add mobile/AGENTS.md mobile/README.md CLAUDE.md
git commit -m "$(cat <<'EOF'
Document local Android development builds for Expo SDK 57.

EOF
)"
```

---

### Task 5: Refresh Dependabot hold comments for SDK 57

**Files:**
- Modify: `.github/dependabot.yml`

**Interfaces:**
- Consumes: none
- Produces: same ignore rules; comments reference SDK 57 / Node 22

- [ ] **Step 1: Update only the comment block above the npm `ignore` list**

Replace:

```yaml
    # Hold majors that are coupled to Expo SDK 56 / the Node 22 runtime:
    #   - eslint 10 breaks eslint-config-expo@56's bundled eslint-plugin-react
    #   - @types/node must track the Node 22 runtime major (see CLAUDE.md)
    # Bump these deliberately alongside an SDK / runtime change, not via a routine PR.
```

with:

```yaml
    # Hold majors that are coupled to eslint-config-expo (SDK 57) / the Node 22 runtime:
    #   - eslint majors can break eslint-config-expo's bundled plugins — bump with the SDK
    #   - @types/node must track the Node 22 runtime major (see CLAUDE.md)
    # Bump these deliberately alongside an SDK / runtime change, not via a routine PR.
```

Do **not** change the `ignore` entries themselves. Do **not** reintroduce the old eight-package Expo SDK pin block.

- [ ] **Step 2: Validate YAML structure**

```bash
python3 -c "import yaml; d=yaml.safe_load(open('.github/dependabot.yml')); npm=[u for u in d['updates'] if u['package-ecosystem']=='npm'][0]; names=[i['dependency-name'] for i in npm['ignore']]; assert names==['eslint','@types/node'], names; print('dependabot ok')"
```

Expected: `dependabot ok`

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "$(cat <<'EOF'
Refresh Dependabot major-hold comments for Expo SDK 57.

EOF
)"
```

---

### Task 6: Final verification

**Files:** none required (verification only)

**Interfaces:**
- Consumes: Tasks 1–5 complete on `feat/expo-57-dev-client`

- [ ] **Step 1: Automated gates**

```bash
cd mobile
just check
npx expo-doctor@latest
just --list
```

Expected: `just check` passes; doctor has no blockers (document any accepted warnings in the PR description); `just --list` shows `android`, `android-clean`, `prebuild`.

- [ ] **Step 2: Confirm git hygiene**

```bash
git status -sb
git log --oneline main..HEAD
```

Expected: branch `feat/expo-57-dev-client`; commits for foundation, SDK 57, justfile, docs, dependabot (plus the earlier design-doc commit); no staged `design_handoff_app_redesign/` or root `package-lock.json`; `android/` untracked or absent (gitignored).

- [ ] **Step 3: Manual smoke (developer machine with device)**

With `ANDROID_HOME`, `JAVA_HOME` (JDK 21 / Studio JBR), and `adb devices` showing a device:

```bash
cd mobile
just android
```

Expected: app installs/launches; Metro serves JS; reload works without Expo Go. If this environment cannot run the device smoke, note that explicitly in the PR body and rely on Step 1.

- [ ] **Step 4: Mark design status**

In `docs/superpowers/specs/2026-08-04-expo-57-dev-client-migration-design.md`, set:

```markdown
**Status:** Implemented
```

Commit if changed:

```bash
git add docs/superpowers/specs/2026-08-04-expo-57-dev-client-migration-design.md
git commit -m "$(cat <<'EOF'
Mark Expo 57 dev-client migration design as implemented.

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Local Android default (`just android` / `expo run:android`) | 3, 4 |
| Day-to-day Metro + dev client | 3, 4 |
| CNG; `android/`/`ios/` gitignored | 2, 3, 4 |
| `prebuild` + `android-clean` recovery | 3, 4 |
| EAS optional backup only | 1, 4 |
| Upgrade to Expo SDK 57 + doctor/check | 2, 6 |
| Keep `expo-dev-client` | 1, 2 |
| Node 22 | Global + 4 |
| Docs: README, AGENTS, CLAUDE | 4 |
| Dependabot comment refresh; keep ignores | 5 |
| Leave unrelated untracked trees out | 1, 6 |
| `just check` + manual smoke | 6 |
