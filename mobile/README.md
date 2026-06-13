# Movie Night — Mobile

The Movie Night mobile app, built with [Expo](https://expo.dev) and React
Native. It renders a turn-ranking screen ("Whose turn?") fetched from the
[backend](../backend) API via `fetchTurn` (`lib/turn.ts`): the least-served
member is highlighted with a "Tonight's pick" badge and a served-count /
last-picked subtitle, with the rest of the standings listed below.

## Stack

- **Expo SDK 56** — React Native tooling and runtime
- **React Native 0.85** / **React 19.2**
- **TypeScript 6.0**

> **Heads up:** Expo APIs are version-specific. Before changing native or Expo
> code, read the docs for this exact SDK:
> <https://docs.expo.dev/versions/v56.0.0/> (see [`AGENTS.md`](AGENTS.md)).

## Prerequisites

- **Node.js 22+** and **npm** — `node --version`
- **[just](https://github.com/casey/just)** (optional) — task runner, same as
  the backend. Every recipe wraps a plain `npm`/`npx` command, so it's not
  required; `just --list` shows them all.
- One way to run the app:
  - **Expo Go** on a physical phone — easiest. This app targets **Expo SDK 56**,
    so you need an Expo Go build that supports SDK 56; if the
    [App Store](https://apps.apple.com/app/expo-go/id982107779) /
    [Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)
    build lags the latest SDK, install the SDK 56 build from
    [`expo.dev/go`](https://expo.dev/go?sdkVersion=56) (Android = sideloaded APK)
    or via [Expo Orbit](https://docs.expo.dev/build/orbit/), or
  - **iOS Simulator** (Xcode, macOS only), or
  - **Android Emulator** (Android Studio), or
  - a **web browser**
- The [backend](../backend) running and reachable, so the app has data to show.

## Install

```bash
npm install
```

## Configuration

The app reads the backend URL from `EXPO_PUBLIC_API_URL`. Expo automatically
loads a `.env` file in this directory:

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:8080
```

You usually don't need to change this. `lib/api.ts` (`resolveApiBaseUrl`)
chooses the right URL at runtime:

- **Simulator / emulator / web:** uses `localhost` — correct, the backend is on
  the same machine.
- **Physical phone (Expo Go):** `localhost` would mean the *phone*, so the app
  automatically derives your dev machine's LAN address from the host Expo used
  to serve the bundle. No editing required.
- **Override (staging / production):** set `EXPO_PUBLIC_API_URL` to an explicit
  non-localhost URL and it wins. This is how a CI/CD build points at a deployed
  backend.

For a physical phone to reach the backend, the backend must listen on your LAN
(i.e. bind `0.0.0.0`, not just `127.0.0.1`) and not be blocked by a firewall.

## Run

Start the Metro bundler:

```bash
just start        # or: npm start
```

Then choose a target from the interactive prompt — press `i` (iOS simulator),
`a` (Android emulator), or `w` (web) — or scan the QR code with **Expo Go** on
your phone. You can also launch a target directly:

```bash
just android      # or: just ios / just web
```

## Connecting to the backend

The turn-ranking screen fetches the seeded group
`11111111-1111-1111-1111-111111111111` ("Friday Film Club"). To see the ranked
roster, make sure the backend is up and seeded first:

```bash
cd ../backend
just db-up && just migrate && just seed && just run
```

Then start the app. If the request fails you'll see an inline error; an empty
group shows "No members yet."

## Troubleshooting

**"Couldn't load turn ranking: Network request failed" on a physical phone.** Usually
a *stale bundle*: a long-running Metro server keeps serving old JavaScript after
you change code or add a dependency, and the older code falls back to
`localhost` — which, on a phone, is the phone itself. Restart Metro with a
cleared cache and **re-scan the QR** (don't tap a "recently opened" entry — it
can reconnect via localhost):

```bash
just start-clean    # = npx expo start -c
```

If it still fails, confirm the backend is genuinely reachable *from the phone*:

- Phone and computer are on the **same Wi-Fi** (no guest network / AP isolation).
- The backend listens on your LAN, not just loopback — `0.0.0.0:8080`, not
  `127.0.0.1:8080`.
- From the phone's browser, `http://<dev-machine-lan-ip>:8080` responds.
- The firewall allows port 8080 on the Wi-Fi interface.

## Quality checks

```bash
just check          # lint + typecheck + test (everything below)

just lint           # ESLint (eslint-config-expo)
just typecheck      # tsc --noEmit
just test           # unit + integration tests (node:test runner)
```

Tests use Node's built-in test runner via `tsx`, mirroring the Go backend's
table-driven style:

- **Unit tests** cover pure logic with no mocks — `lib/api.test.ts`
  (URL resolution), `lib/members.test.ts` (roster payload validation), and
  `lib/turn.test.ts` (turn payload validation).
- **Integration tests** exercise `fetchMembers` (`lib/members.integration.test.ts`)
  and `fetchTurn` (`lib/turn.integration.test.ts`) against a real local HTTP
  server over a real `fetch`, with no mocking.

There are no component/render tests yet — deferred until there's UI logic worth
asserting.

## Git hooks

This repo uses [lefthook](https://lefthook.dev) (config at the repo root):

- **pre-commit** — secret scan ([betterleaks](https://github.com/betterleaks/betterleaks))
  plus, for mobile, `just lint` and `just typecheck` on staged JS/TS files.
- **pre-push** — `just test` (unit + integration tests) before code leaves your machine.

The full CI suite still runs on every PR. Enable the hooks once per clone:

```bash
go install github.com/evilmartians/lefthook/v2@latest   # or: brew install lefthook
sudo dnf install betterleaks   # or: brew install betterleaks (also: docker / releases page)
lefthook install               # from the repo root
```

## Project layout

```
mobile/
├── App.tsx            # root component — the turn-ranking screen ("Whose turn?")
├── index.ts           # Expo entrypoint (registerRootComponent)
├── lib/               # framework-free logic + its tests
│   ├── api.ts         # resolveApiBaseUrl — picks the backend URL
│   ├── turn.ts        # fetchTurn + parseTurn (validation) — used by the screen
│   └── members.ts     # fetchMembers + parseMembers (still tested; /members endpoint)
├── app.json           # Expo app config
├── eslint.config.js   # ESLint flat config
├── justfile           # task recipes (just) — parity with the backend
├── tsconfig.json      # TypeScript config
└── assets/            # icons and images
```
