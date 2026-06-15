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

- **Expo SDK 56**
- **[expo-router](https://docs.expo.dev/router/introduction/)** — file-based navigation (`app/`)
- **React Native 0.86** / **React 19.2**
- **TypeScript 6.0**

Expo APIs are version-specific — read the
[SDK 56 docs](https://docs.expo.dev/versions/v56.0.0/) before changing native or
Expo code (see [`AGENTS.md`](AGENTS.md)).

## Prerequisites

- **Node.js 22+** and **npm**
- **[just](https://github.com/casey/just)** (optional) — wraps the `npm`/`npx` recipes
- A run target — **Expo Go** (physical phone), **iOS Simulator**, **Android
  Emulator**, or **web**. Expo Go must support SDK 56; if the store build lags,
  install the SDK 56 build from [`expo.dev/go`](https://expo.dev/go?sdkVersion=56)
  or via [Expo Orbit](https://docs.expo.dev/build/orbit/).
- The [backend](../backend) running and reachable

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

A physical phone reaches the backend only when the backend binds the LAN
(`0.0.0.0`, not `127.0.0.1`) and the firewall allows the port.

## Run

```bash
just start        # or: npm start
```

Press `i` / `a` / `w` for an iOS simulator / Android emulator / web target, or
scan the QR with Expo Go. Launch directly with `just android` / `just ios` /
`just web`.

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
Restart with a cleared cache and re-scan the QR (don't reopen a recent entry):

```bash
just start-clean    # = npx expo start -c
```

If it persists, confirm the backend is reachable from the phone:

- Phone and computer on the same Wi-Fi (no AP isolation).
- Backend bound to `0.0.0.0:8080`, not loopback.
- `http://<dev-machine-lan-ip>:8080` responds from the phone's browser.
- Firewall allows port 8080.

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
