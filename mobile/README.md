# Movie Night — Mobile

The Movie Night mobile app, built with [Expo](https://expo.dev) and React
Native. It currently renders a group's roster fetched from the
[backend](../backend) API.

## Stack

- **Expo SDK 56** — React Native tooling and runtime
- **React Native 0.85** / **React 19**
- **TypeScript 6**

> **Heads up:** Expo APIs are version-specific. Before changing native or Expo
> code, read the docs for this exact SDK:
> <https://docs.expo.dev/versions/v56.0.0/> (see [`AGENTS.md`](AGENTS.md)).

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

- **Simulator / emulator / web:** `localhost` works.
- **Physical phone (Expo Go):** `localhost` refers to the *phone*, not your
  computer. Use your dev machine's LAN IP instead, e.g.
  `EXPO_PUBLIC_API_URL=http://192.168.1.50:8080`.

If `EXPO_PUBLIC_API_URL` is unset, the app falls back to `http://localhost:8080`.

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

## Testing

No test suite is set up for the mobile app yet. TypeScript itself is the first
line of defense — type-check with:

```bash
npx tsc --noEmit
```

## Project layout

```
mobile/
├── App.tsx          # root component — the roster screen
├── index.ts         # Expo entrypoint (registerRootComponent)
├── app.json         # Expo app config
├── tsconfig.json    # TypeScript config
└── assets/          # icons and images
```
