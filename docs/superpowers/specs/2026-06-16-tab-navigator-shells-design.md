# Bottom tab navigator + four tab shells (#31)

Date: 2026-06-16
Branch: `feat/tab-navigator`
Epic: #28 · Phase 1 · follows PR1 (foundation + primitives, merged as #52)
Slice spec under: `2026-06-16-spotlight-redesign-phase1-design.md`

## Goal

Introduce the navigation backbone the old three-screen app never had: a bottom tab
navigator (**Tonight · History · The Club · Settings**) over an expo-router `(tabs)`
group, the three shared top-bar kinds (`home` / `tab` / `title`) as a reusable
chrome component, and four empty tab shells that later issues fill in
(#32 Tonight, #36 History, #34 The Club, #37 Settings).

This is purely the nav shell. No screen gets its real content here; the existing
`night`/`manage` screens are kept working but moved out of the primary nav.

## Context / starting point

- Foundation is merged to `main`: fonts/icons/logomark (#29) and UI primitives (#30)
  live in `mobile/components/` (incl. `Logomark`), tokens in `mobile/theme/`.
- Current routes: `app/index.tsx` (turn-list), `app/night.tsx`, `app/manage.tsx`,
  wired in `app/_layout.tsx` as a flat `Stack`.
- `lucide-react-native` and `react-native-safe-area-context` are already deps.
- **`expo-blur` is not yet a dependency** — it gets added here for the tab bar.
- **Do not hardcode** colors/type/spacing/radii/shadows — import from `theme/`.

## Decisions (settled in brainstorming)

1. **Pure empty shells.** The four tab screens render their top bar + one honest
   placeholder line. No turn/night/manage content is wired into them; that arrives
   in the per-screen issues.
2. **Real blur.** Add `expo-blur` and use `BlurView` for the tab bar's
   `night-950 @ 86% + blur`, rather than approximating with a solid fill.

## Architecture

### Route restructure (expo-router)

```
app/
  _layout.tsx              # root Stack — (tabs) headerless + parked night/manage
  (tabs)/
    _layout.tsx            # Tabs, custom tabBar, headerShown:false
    index.tsx              # Tonight  shell — TopBar kind="home"
    history.tsx            # History  shell — TopBar kind="tab"
    club.tsx               # The Club shell — TopBar kind="tab"
    settings.tsx           # Settings shell — TopBar kind="tab"
  night.tsx                # PARKED — routable stack screen, no tab/link points to it
  manage.tsx               # PARKED — same
```

- Old `app/index.tsx` (turn-list UI) is **removed** — `(tabs)/index.tsx` takes over
  the `/` route, and the turn/rotation UI is purpose-built in #32/#33. `lib/turn.ts`
  is untouched; git history preserves the old screen.
- `night.tsx` / `manage.tsx` are **parked**: still declared as stack screens under
  the root layout (so they compile, still work, and satisfy the issue's "rehomed or
  routed"), but nothing in the tab nav links to them. #34 (The Club) and #35 (night
  flow) rebuild them into the final structure and retire the parked routes. They keep
  their current default `Stack` header for now.

> Relationship to the epic spec: that doc describes the **end state**
> (`rotation.tsx`, `night/new.tsx`, …) where the old screens are fully rebuilt. The
> parked routes here are temporary scaffolding for the slice between then and now.

### Shared chrome — `components/TopBar.tsx`

One component, a `kind` prop with all three variants the issue requires:

- **`home`** (Tonight): `Logomark` + "Movie Night" serif wordmark + group name in
  mono + a right slot (gear → Settings).
- **`tab`** (History / Club / Settings): large left-aligned serif title (34px) +
  optional mono sub-line + right slot.
- **`title`** (centered serif title + ember back link + right slot): built now per
  the issue's "implement the three kinds"; first exercised by pushed screens in later
  issues.

Top inset comes from `useSafeAreaInsets().top` (not the prototype's hardcoded 54px).
Exported from `components/index.ts`.

### Tab bar — `(tabs)/_layout.tsx`

A custom `tabBar` for pixel control over the spec:

- Background: `BlurView` (expo-blur) tinted `night-950` @ 86%, 1px hairline top
  border (`border.hairline`).
- Four items, each = lucide icon (`Clapperboard` / `History` / `UsersRound` /
  `Settings`) + an 11px Hanken label.
- Active = `accent-strong` (ember) + bold label; inactive = `text-tertiary`.
- Bottom padding from `useSafeAreaInsets().bottom` (home indicator).

`headerShown: false` on the Tabs (each screen renders its own `TopBar`).

### Theme additions — `theme/typography.ts`

The current scale lacks the chrome sizes (11 / 20 / 24 / 34) and chrome presets. Add
presets so components import instead of hardcoding:

- `wordmark` — serif 20 (home top bar)
- `tabTitle` — serif 34 (tab top bar)
- `barTitle` — serif 24 (title top bar)
- `tabLabel` — sans 11 (tab bar item)
- group-meta / tab-bar mono 11 reuses a small mono preset

Add matching `fontSize` entries as needed; keep tracking/line-height conventions.

### The four shells

Each = the right `TopBar` + a single honest placeholder line, in a scrollable body
with bottom padding clearing the tab bar. Placeholder copy stays honest, e.g.
History: "No nights yet — start one." Real content lands in #32/#34/#36/#37.

### Group name source

The `home` top bar needs a group name; no group endpoint exists, so for the shell it
is a constant ("Friday Film Club", matching the shared seed). Temporary — a real
source arrives with later work.

## Testing

No new pure functions, so no new unit tests (repo convention: presentational
components aren't unit-tested). The gate is **`just check`** (lint + typecheck +
existing tests) green.

Manual smoke: run the app, confirm all four tabs switch, the active item is ember,
the home/tab top bars render, and the parked `night`/`manage` routes still load.

## Non-goals

- Any real tab content (turn spotlight, history list, members, settings rows).
- Redesigning or rebuilding `night`/`manage` (they are only parked).
- Welcome / first-run, pushed detail screens, scheduling — later issues.
