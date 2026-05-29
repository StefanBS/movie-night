# Movie Night — Mobile

The Movie Night mobile app, built with [Expo](https://expo.dev) and React
Native. It currently renders a group's roster fetched from the
[backend](../backend) API.

## Stack

- **Expo SDK 54** — React Native tooling and runtime
- **React Native 0.81** / **React 19**
- **TypeScript 5.9**

> **Heads up:** Expo APIs are version-specific. Before changing native or Expo
> code, read the docs for this exact SDK:
> <https://docs.expo.dev/versions/v54.0.0/> (see [`AGENTS.md`](AGENTS.md)).

## Prerequisites

- **Node.js 22+** and **npm** — `node --version`
- One way to run the app:
  - **Expo Go** on a physical phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) /
    [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)) — easiest, or
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
npm start
```

Then choose a target from the interactive prompt — press `i` (iOS simulator),
`a` (Android emulator), or `w` (web) — or scan the QR code with **Expo Go** on
your phone. You can also launch a target directly:

```bash
npm run ios      # iOS simulator
npm run android  # Android emulator
npm run web      # web browser
```

## Connecting to the backend

The roster screen fetches the seeded group
`11111111-1111-1111-1111-111111111111` ("Friday Film Club"). To see members,
make sure the backend is up and seeded first:

```bash
cd ../backend
just db-up && just migrate && just seed && just run
```

Then start the app. If the request fails you'll see an inline error; an empty
group shows "No members yet."

## Quality checks

```bash
npm test            # unit + integration tests (node:test runner)
npm run lint        # ESLint (eslint-config-expo)
npx tsc --noEmit    # type-check
```

Tests use Node's built-in test runner via `tsx`, mirroring the Go backend's
table-driven style:

- **Unit tests** cover pure logic with no mocks — `lib/api.test.ts`
  (URL resolution) and `lib/members.test.ts` (payload validation).
- **Integration tests** (`lib/members.integration.test.ts`) exercise
  `fetchMembers` against a real local HTTP server over a real `fetch`, with no
  mocking.

There are no component/render tests yet — deferred until there's UI logic worth
asserting.

## Project layout

```
mobile/
├── App.tsx            # root component — the roster screen
├── index.ts           # Expo entrypoint (registerRootComponent)
├── lib/               # framework-free logic + its tests
│   ├── api.ts         # resolveApiBaseUrl — picks the backend URL
│   └── members.ts     # fetchMembers + parseMembers (validation)
├── app.json           # Expo app config
├── eslint.config.js   # ESLint flat config
├── tsconfig.json      # TypeScript config
└── assets/            # icons and images
```
