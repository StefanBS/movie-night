# Tonight home — whose-turn spotlight + On deck

Issue: [#32](https://github.com/StefanBS/movie-night/issues/32) · Part of [#28](https://github.com/StefanBS/movie-night/issues/28) (Phase 1, handoff screen 2).

## Goal

Replace the placeholder Tonight tab (`mobile/app/(tabs)/index.tsx`) with the
real "no night planned" home: an ember **Spotlight hero** for whoever is next up,
an **On deck** list of the following three, and the three home actions. Wired to
the existing `GET /groups/{groupId}/turn` endpoint via `fetchTurn`. Done when it
renders real turn data.

This is the only home state until scheduling lands in Phase 3, so the
planned-night variant from the prototype is out of scope.

## Data flow

The screen owns its data the same way `app/night.tsx` does:

- On mount, a `useEffect` + `AbortController` calls
  `fetchTurn(API_URL, GROUP_ID)` (`lib/turn.ts`).
- `API_URL` is resolved once via `resolveApiBaseUrl({ envUrl, hostUri })` and
  `GROUP_ID` comes from `lib/api` — identical to `night.tsx`.
- The group name stays the existing `GROUP_NAME` constant in the screen (a real
  source arrives with later work).
- `fetchTurn` returns `TurnMember[]` **already sorted**: element 0 is the picker
  ("next up"); elements 1–3 are "On deck".

Three render states, with `TopBar` (kind `home`, gear → `/settings`) mounted in
all three:

1. **loading** — centered `ActivityIndicator` (ember) in the body.
2. **error** — centered error line (`Couldn't load tonight: <message>`), using
   `errorMessage(e, …)` from `lib/errors`.
3. **loaded** — the content described below.

## Pure helpers (table-driven unit tests, no mocks)

These keep branchy display logic out of JSX and unit-testable, matching the
repo's "pure functions in `lib/`" convention.

- `lib/date.ts` → add **`formatShortDate(iso: string): string`** —
  `"2026-05-30"` → `"May 30"` (a port of the prototype's `fmtDate`). Splits the
  ISO string by hand (no `Date` parsing) so it stays timezone-independent, like
  the existing `todayLocalISO`.
- `lib/turn.ts` → add:
  - **`picksLabel(n: number): string`** — `2` → `"2 picks"`, `1` → `"1 pick"`,
    `0` → `"0 picks"`.
  - **`pickerMeta(member: TurnMember): string`** — the hero meta line:
    `servedCount === 0` → `"First turn · hasn't picked yet"`; otherwise
    `` `${picksLabel(servedCount)} · last ${formatShortDate(lastPickedOn)}` ``.
    (When `servedCount > 0`, `lastPickedOn` is non-null in practice; if it were
    null the branch returns the first-turn copy as a guard.)

## Screen (`app/(tabs)/index.tsx`)

A `ScrollView` whose `contentContainerStyle` adds bottom padding clearing the
blurred tab bar. Two **local** sub-components defined in the same file (mirroring
how `night.tsx` keeps `Poster`/`PickRow` local rather than in `components/` —
these are screen-specific, not shared primitives):

### `SpotlightHero({ member }: { member: TurnMember })`

The rationed-ember card — the only place ember means "whose turn it is":

- Card: `surface.dark` background, `radius.xl`-ish rounded, `shadow.spotlight`,
  `overflow: hidden`, centered column.
- **Top ember wash**: an absolutely-positioned `react-native-svg` `RadialGradient`
  (centered at the top-middle) blooming ember → transparent — the prototype's
  `radial-gradient(80% 55% at 50% 0%, rgba(246,139,54,0.26), transparent 62%)`.
- `✦ NEXT UP` — mono uppercase tag in `accent.strong` (`textPresets.tag`).
- **Avatar**: 64px, with a `react-native-svg` `RadialGradient` halo behind it
  (the prototype's `radial-gradient(circle, accent-glow, transparent 70%)` —
  "the bonfire halo") plus the existing `Avatar` `glow` prop for the ember ring.
- Name: serif display (`textPresets.screenTitle` / display size), `text.primary`.
- Meta: mono line from `pickerMeta(member)`, in a muted tone.

Both glows use `react-native-svg`'s `RadialGradient` (already a dependency) for
true radial fidelity; `expo-linear-gradient` is **not** used on this screen.

### `OnDeck({ members }: { members: TurnMember[] })`

- `SectionLabel` "On deck".
- Up to 3 rows (elements 1–3 of the turn): mono rank number · `sm` `Avatar` ·
  name (`rowName`) · `picksLabel(servedCount)` in a muted mono tone, hairline
  divider between rows.
- Rendered only when there is ≥1 on-deck member.

### Actions (below the hero)

Per issue #32 and the agreed wiring:

- Primary `AppButton` **"Plan a night  →"** (`fullWidth`) →
  `router.navigate("/night")` (the existing legacy night route; the redesigned
  flow is #35).
- Ghost `AppButton` **"{firstName} can't make it — skip turn"** → **no-op**
  (`onPress` does nothing). UI only until the skip-turn backend (#42).
- Ghost `AppButton` **"See full rotation  →"** (ember label) → **no-op**. The
  full-rotation screen is #33. Rendered for layout fidelity but inert.

`{firstName}` is `member.name.split(" ")[0]`.

## Edge cases

- **Empty rotation** (`fetchTurn` returns `[]` — no active core members): show a
  centered empty-state line (e.g. "No one's in the rotation yet.") in place of
  the hero and On deck. The "Plan a night" action is hidden in this state since
  there is no picker.
- **Fewer than 3 on deck**: render only the members that exist; hide the On deck
  section entirely when there are none.
- **First turn** (`servedCount === 0`, `lastPickedOn === null`): handled by
  `pickerMeta`.

## Testing & verification

- New pure helpers get table-driven tests: `formatShortDate` cases in
  `lib/date.test.ts`; `picksLabel` and `pickerMeta` cases (including the
  first-turn branch) in `lib/turn.test.ts`.
- No React Native render tests — the repo has none; UI is verified by running the
  app. Logic that warrants tests lives in the pure helpers above.
- Gate: `just check` (lint + typecheck + test) must pass.
- Per `mobile/AGENTS.md`, confirm the v56 `react-native-svg` `RadialGradient`
  API against <https://docs.expo.dev/versions/v56.0.0/> before wiring it.
- Manual: run the app against the seeded "Friday Film Club" group and confirm the
  hero renders the real picker, On deck shows the next three, the meta lines and
  picks counts match, and "Plan a night" routes to the night screen.

## Out of scope

- The planned-night home variant (Phase 3 scheduling).
- The full-rotation screen and skip-turn behavior (#33, #42) — buttons are inert.
- Any change to the turn endpoint or its payload.
