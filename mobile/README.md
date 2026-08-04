# Movie Night — Mobile

Expo / React Native app for the Movie Night [backend](../backend). Three
[expo-router](https://docs.expo.dev/router/introduction/) screens:

- **Whose turn?** (`app/index.tsx`) — least-served standings; element 0 is
  flagged "Next up".
- **Manage members** (`app/manage.tsx`) — join members and run churn transitions
  (deactivate / reactivate / promote).
- **Tonight** (`app/night.tsx`) — track attendees, attach a movie (TMDB), record
  the pick.

The UI follows the "Spotlight" design system; tokens live in `theme/` and are
documented in [`CLAUDE.md`](CLAUDE.md).

## Stack

- **Expo SDK 57**
- **[expo-router](https://docs.expo.dev/router/introduction/)** — file-based navigation (`app/`)
- **[expo-dev-client](https://docs.expo.dev/develop/development-builds/introduction/)** — local development builds (not Expo Go)
- **React Native** / **React** — versions pinned by the Expo SDK 57 set
- **TypeScript 6.0**

Expo APIs are version-specific — read the
[SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/) before changing native or
Expo code (see [`AGENTS.md`](AGENTS.md)).

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

## Install

```bash
npm install
```

## Configuration

The backend URL comes from `EXPO_PUBLIC_API_URL`, loaded from `.env`:

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:8080
```

`resolveApiBaseUrl` (`lib/api.ts`) picks the URL at runtime:

- **Simulator / emulator / web** — `localhost`.
- **Physical phone** — derives the dev machine's LAN address from Expo's host URI.
- **Staging / production** — an explicit non-localhost `EXPO_PUBLIC_API_URL`
  overrides both.

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

## Connecting to the backend

The app fetches the seeded group `11111111-1111-1111-1111-111111111111`
("Friday Film Club"). Start the backend first:

```bash
cd ../backend
just db-up && just migrate && just seed && just run
```

A failed request shows an inline error; an empty group shows "No members yet."

## Troubleshooting

**"Couldn't load turn order: Network request failed" on a physical phone** —
usually a stale Metro bundle serving old code that falls back to `localhost`.
Restart with a cleared cache and reload in the dev client / restart Metro:

```bash
just start-clean    # = npx expo start -c
```

If it persists, confirm the backend is reachable from the phone:

- Phone and computer on the same Wi-Fi (no AP isolation).
- Backend bound to `0.0.0.0:8080`, not loopback.
- `http://<dev-machine-lan-ip>:8080` responds from the phone's browser.
- Firewall allows port 8080.

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

## Quality checks

```bash
just check          # lint + typecheck + test (everything below)

just lint           # ESLint (eslint-config-expo)
just typecheck      # tsc --noEmit
just test           # unit + integration tests (node:test runner)
```

Tests run on Node's built-in runner via `tsx` (`lib/**/*.test.ts`), table-driven
like the Go backend:

- **Unit** (`*.test.ts`) — pure logic, no mocks: URL resolution (`api`), payload
  validation (`members`, `turn`, `movies`, `nights`), dates (`date`), error
  extraction (`errors`).
- **Integration** (`*.integration.test.ts`) — fetch helpers (`http`, `members`,
  `turn`, `movies`, `nights`) against a real local HTTP server, no mocking.

No component/render tests yet.

## Git hooks

[lefthook](https://lefthook.dev) (config at the repo root):

- **pre-commit** — [betterleaks](https://github.com/betterleaks/betterleaks)
  secret scan + `just lint` / `just typecheck` on staged JS/TS files.
- **pre-push** — `just test`.

The full CI suite runs on every PR. Enable hooks once per clone:

```bash
go install github.com/evilmartians/lefthook/v2@latest   # or: brew install lefthook
sudo dnf install betterleaks   # or: brew install betterleaks (also: docker / releases page)
lefthook install               # from the repo root
```

## Project layout

```
mobile/
├── app/               # expo-router screens (entry = expo-router/entry)
│   ├── _layout.tsx    # root Stack + font loading + Spotlight theming
│   ├── index.tsx      # "Whose turn?" — turn standings
│   ├── manage.tsx     # "Manage members" — join + churn transitions
│   └── night.tsx      # "Tonight" — attendees, movie attach, record pick
├── lib/               # framework-free logic + its tests (unit + integration)
│   ├── api.ts         # resolveApiBaseUrl + GROUP_ID — picks the backend URL
│   ├── http.ts        # shared fetch/JSON/error helper
│   ├── turn.ts        # fetchTurn + validation
│   ├── members.ts     # fetchMembers, joinMember, transitionMember
│   ├── nights.ts      # night lifecycle calls (create/attendee/pick/movie)
│   ├── movies.ts      # searchMovies + movie helpers
│   ├── date.ts        # local-date helpers (todayLocalISO)
│   └── errors.ts      # errorMessage — backend error extraction
├── components/        # shared presentational components (AppButton)
├── theme/             # "Spotlight" design tokens (colors, spacing, typography)
├── assets/            # icons, images, and brand fonts
├── app.json           # Expo app config
├── eslint.config.js   # ESLint flat config
├── justfile           # task recipes (just) — parity with the backend
└── tsconfig.json      # TypeScript config
```
