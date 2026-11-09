# Movie Night — Mobile

Expo / React Native app for the Movie Night [backend](../backend). Three tabs,
built with [expo-router](https://docs.expo.dev/router/introduction/):

- **Tonight**: whose turn it is, who's on deck, the next night, and any
  other nights already planned.
- **Watched**: every night the group has had, newest first, by month.
- **Club**: members in rotation, guests, and inactive members; add someone new.

Settings (your identity, the group name, and reminders) opens from the gear on
Tonight. Planning a night (when, who, which film) and editing it are
full-screen flows on top of the tabs. On first run, a welcome screen asks
which member you are.

The UI follows the "Spotlight, refined" design system; tokens live in `theme/`
and the rules are in [`CLAUDE.md`](CLAUDE.md).

## Stack

- **Expo SDK 58**
- **[expo-router](https://docs.expo.dev/router/introduction/)** — file-based navigation (`app/`)
- **[expo-dev-client](https://docs.expo.dev/develop/development-builds/introduction/)** — local development builds (not Expo Go)
- **React Native** / **React** — versions pinned by the Expo SDK 58 set
- **TypeScript 6.0**

Expo APIs are version-specific — read the
[SDK 58 docs](https://docs.expo.dev/versions/v58.0.0/) before changing native or
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

**Opening the app from the terminal** (adb-attached, including wireless adb):

```bash
just phone launch [port]    # force-stop, open the dev client on http://<lan-ip>:<port> (8081), wait for load
just phone has "someText"   # exit 0 if the text is in the phone's JS bundle, 1 if not
just phone devlink          # print the deep link that opens the dev client on Metro
```

To drive the app (tap, read the screen, screenshot), use Maestro: `maestro
hierarchy` prints what's on screen, and a flow does the rest (see
[End-to-end tests](#end-to-end-tests-maestro)).

Before trusting any on-device result, run `just phone has <something from your
change>`. A long-running Metro can serve the phone a stale bundle even when a
fresh `curl` of the bundle shows new code.

### End-to-end tests (Maestro)

`.maestro/` holds [Maestro](https://maestro.dev/) flows that drive the dev
client on the adb-attached phone: plan a night, edit then cancel one, mark one
watched, and add a member. Run them before merging a UI change:

```bash
just e2e "<text from your change>"                     # every flow
just e2e "<text from your change>" .maestro/plan-night.yaml   # just one
```

`just e2e` launches the app (`just phone launch`), refuses to run if the
phone's bundle lacks your text (`just phone has`), then runs each flow on a
fresh dev DB (`just reseed` in `backend/`). Reseeding revokes the phone's identity, so
each flow reopens the app (the deep link from `just phone devlink`) on "Who are
you?" and claims Ada. The flows never clear the app's state: that would also
wipe its granted permissions and bring back system and dev-client dialogs. The
backend, its Postgres, and Metro must be running, and the phone unlocked.
Movie search goes to the real TMDB, so flows match a film by title ("Dune"),
never by its position in the results.

Install Maestro from its release zip (it needs Java 17+), not a `curl | bash`
installer:

```bash
v=2.12.0   # https://github.com/mobile-dev-inc/Maestro/releases
curl -fsSLO https://github.com/mobile-dev-inc/Maestro/releases/download/cli-$v/maestro.zip
curl -fsSLO https://github.com/mobile-dev-inc/Maestro/releases/download/cli-$v/checksums_sha256.txt
sha256sum -c --ignore-missing checksums_sha256.txt
unzip -q maestro.zip -d ~/.local/opt && ln -sf ~/.local/opt/maestro/bin/maestro ~/.local/bin/maestro
maestro --version
```

### Optional: EAS development build

If you cannot use a local Android toolchain, an EAS development profile is
configured in `eas.json`. Install EAS CLI (`npm install --global eas-cli` or
`npx eas-cli@latest`), then:

```bash
eas build --platform android --profile development
```

Install the resulting APK, then use `just start` as usual. Prefer local
`just android` when possible.

### Android push (reminders)

Reminders ([ADR-0010](../docs/adr/0010-server-push-reminders.md)) need a
Firebase project, its `google-services.json` in the app, and its FCM V1
service-account key uploaded to EAS. Until then, Settings → "Reminders &
nudges" shows "Not on this device". A wizard walks through every step, then
rebuilds the client and can send a test push:

```bash
bash scripts/setup-android-push.sh
```

Commit the `google-services.json` and `app.json` changes it makes. Never commit
the service-account key.

## Connecting to the backend

The app fetches the seeded group `11111111-1111-1111-1111-111111111111`
("Friday Film Club"). Start the backend first:

```bash
cd ../backend
just db-up && just migrate && just seed && just run
```

A failed request shows an inline error on the screen that made it.

## Troubleshooting

**"Couldn't load …: Network request failed" on a physical phone** —
usually a stale Metro bundle serving old code that falls back to `localhost`.
Restart with a cleared cache and reload in the dev client / restart Metro:

```bash
just start-clean    # = npx expo start -c
```

Then `just phone launch` and check with `just phone has <text from your change>`.

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
just check          # everything below

just lint           # ESLint (eslint-config-expo)
just typecheck      # tsc --noEmit
just test           # unit + integration tests (node:test runner)
just check-deps     # every dep matches the Expo SDK version matrix
```

Tests run on Node's built-in runner via `tsx` (`lib/**/*.test.ts`), table-driven
like the Go backend:

- **Unit** (`*.test.ts`): pure logic with no mocks, such as payload validation,
  dates, and night-editing rules.
- **Integration** (`*.integration.test.ts`): the fetch helpers and night flows
  against a real local HTTP server.

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

## App icons and splash

The launcher icons, Android adaptive layers, splash images and favicon in
`assets/*.png` are rendered from the brand SVGs in `assets/brand/`, which are
copied byte for byte from `docs/design-system/assets/`. After refreshing the
SVGs, re-render with `just icons` (needs Inkscape and ImageMagick) and rebuild
the dev client (`just android-clean`): icons and splash are native, so Metro
won't pick them up. The splash follows the OS theme: the light mark on the
light page, the dark mark on `#11100E`.

## Project layout

```
mobile/
├── app/               # expo-router screens
│   ├── _layout.tsx    # root stack, fonts, theming
│   ├── (tabs)/        # Tonight, Watched, Club
│   ├── night/         # plan, view, and edit a night
│   ├── member/        # member profile, add a member
│   ├── rotation.tsx   # the full turn order
│   ├── settings.tsx   # identity, group name, reminders (from Tonight's gear)
│   └── welcome.tsx    # first run: pick who you are
├── lib/               # framework-free logic + its tests (no React Native imports)
├── components/        # shared UI; night/ holds the night-flow steps
├── *.ts               # thin native adapters (secure storage, push, calendar, API URL)
├── theme/             # "Spotlight, refined" design tokens (colors, spacing, typography)
├── assets/            # brand SVGs, the icon/splash PNGs rendered from them, fonts
├── scripts/           # `just phone` launch/bundle check, Android push setup wizard
├── app.json           # Expo app config
├── eslint.config.js   # ESLint flat config
├── justfile           # task recipes (just) — parity with the backend
└── tsconfig.json      # TypeScript config
```
