# Spotlight Redesign — Phase 1 (mobile visual redesign, existing API)

Date: 2026-06-16
Branch: `redesign-spotlight-app`
Epic: #28 · Phase 1 issues: #29–#38

## Goal

Reorganize the Movie Night mobile app from three ad-hoc screens
(`index`/`night`/`manage`) into the coherent four-tab **Spotlight** app described in
`design_handoff_app_redesign/`, **wired only to the existing Go backend API**.
Scheduling (Phase 3), recurrence (Phase 4), and native notifications/calendar
(Phase 5) are out of scope. Backend additions (Phase 2) are out of scope; screens
that need them ship with honest stubs that point at their Phase 2 issue.

## Context / starting point

- `mobile/theme/` already holds the full Spotlight token set (colors, typography,
  spacing, shadow, motion). **Do not hardcode tokens** — import from `theme/`.
- Only one component exists: `components/AppButton.tsx`.
- Data layer (`mobile/lib/*.ts`) talks to the real backend over HTTP.
  Current endpoints: `GET /groups/{id}/members`, `GET /groups/{id}/turn`,
  member join/deactivate/reactivate/promote, nights create/current/detail/turn,
  attendees add/remove, pick, `GET /movies/search`, night movie attach.
- **No backend endpoint for:** a nights history *list*, reactions, group settings,
  or skip-turn. These gate History, Settings, and the skip control.

## Architecture

### Routing (expo-router restructure)

```
app/
  _layout.tsx              # root stack (fonts gate, SplashScreen)
  welcome.tsx              # first-run (shown when no group resolves)
  (tabs)/
    _layout.tsx            # bottom tab bar: Tonight · History · The Club · Settings
    index.tsx              # Tonight (home)
    history.tsx            # History
    club.tsx               # The Club
    settings.tsx           # Settings
  rotation.tsx             # The order (pushed from Tonight)
  night/new.tsx            # night flow wizard — tonight-only this phase
  night/[id].tsx           # night detail (pushed from History)
  member/[id].tsx          # member profile (pushed from The Club)
  member/new.tsx           # add member (sheet)
```

The old `index/night/manage` screens are rebuilt into this structure, not kept in
parallel.

### Component layer (`mobile/components/`)

Primitives (#30), each token-driven, press dip to opacity 0.72 / 130ms, no bounce:
`Button` (extends `AppButton`; variants primary/secondary/ghost/danger), `Badge`
(solid + mono tones), `Avatar` (deterministic initials + tint, ember-glow-ring
variant), `Input` (optional addon button), `MemberRow` (rank + avatar + name + mono
meta, spotlight variant), `IconButton`, `Poster` (TMDB image + gradient fallback),
`Stat`, `SectionLabel`, `Toggle`, `Banner`.

Shared chrome: the three top-bar kinds (`home` / `tab` / `title`) and the bottom tab
bar (`night-950` @ 86% + blur, hairline top, active = `accent-strong`).

The avatar tint+initials helper is a pure function → table-driven unit test
(matches the repo's no-mocks convention).

### Data wiring (existing API only)

| Screen | Endpoint(s) |
|---|---|
| Tonight, The order, The Club | `GET /groups/{id}/turn`, `GET /groups/{id}/members` |
| Member profile / add / role changes | members mutations |
| Night flow (Who → Pick → Recorded) | nights create/current/attendees/pick, `/movies/search`, movie attach |
| Night detail | `GET /nights/{id}` |

### Honest stubs (no backend this phase)

- **History list** — no list endpoint (→ #39). Show an honest empty state; render
  the current night only where available. Reaction glyphs render only when present.
- **Settings** — toggles are local no-ops with a visible "not saved yet" cue (→ #41).
  Render real group name/since where the API provides them.
- **Skip turn** — UI present but disabled/no-op (→ #42).

### Deferred to later phases (visible seams)

- The night flow opens at **Who's here** (no When step); a future date / Scheduled
  branch is Phase 3 (#44/#45).
- The home shows only the whose-turn spotlight (no Up-next card; Phase 3 #46).

## Build order

Foundation-up, per the handoff's suggested order:
1. Fonts + icons + logomark + primitives (#29, #30)
2. Tab navigator + Tonight + The order (#31, #32, #33)
3. The Club + member profile + add member (#34)
4. Night flow tonight-only (#35)
5. History + Settings + Welcome (#36, #37, #38)

## PR slicing

Five small, independently reviewable PRs matching the build-order groups above
(repo squash-merges slice PRs, so each PR title/body is standalone). Each PR closes
its issues and ticks the epic checklist.

## Testing

- Pure helpers (avatar tint/initials, any formatting) → table-driven unit tests via
  `node:test`/`tsx`, no mocks (repo convention).
- `just check` (lint + typecheck + test) green before each PR.
- Manual: run the app against the dev backend and verify each screen renders real
  turn/members/night data.

## Non-goals

Backend changes, scheduling, recurrence, notifications, calendar export, and any
redraw of the brand logomark.
