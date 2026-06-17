# Settings tab — design

Date: 2026-06-18
Issue: #37 (Redesign P1.9) · Epic #28 · Phase 1, handoff screen 14
Parent spec: `docs/superpowers/specs/2026-06-16-spotlight-redesign-phase1-design.md`

## Goal

Replace the Settings tab placeholder with the full Spotlight Settings UI:
a **house-rule card**, then grouped rows for **Group**, **Rotation**,
**Notifications**, and a red **Danger zone**. Wire only what the **existing**
backend supports — which, for this screen, is nothing — so the screen is
presentational with session-local toggle state.

## Context / constraints

- **Phase 1 = existing API only.** The epic (#28) forbids new endpoints this
  phase. The `groups` table *does* have `name` and `created_at`, but no
  `GET /groups/{groupId}` route or query exposes them, and members/turn
  responses don't carry the name. Adding a read endpoint is deferred (Phase 2);
  this screen stays mobile-only.
- **No settings persistence yet (→ #41).** Toggles are session-local and reset
  on reload. Notifications and Danger-zone actions have no backend, so those
  rows are rendered **disabled**. One info `Banner` flags that settings aren't
  saved yet. A `TODO(#41)` comment marks the persistence seam (mirroring the
  existing `TODO(#39)` in `history.tsx`).
- **Native notifications are Phase 5 (→ #50).** The Notifications group is a
  single disabled row this phase — no `expo-notifications`, no navigation.
- **Group name** is rendered from a named shared-contract constant
  (`GROUP_NAME` in `lib/api.ts`, beside `GROUP_ID`), not an inline literal and
  not a fetch. "Since" is **omitted** — we render only what we actually know.
- Follow the parent spec / CLAUDE.md: import all tokens from `theme/`, never
  hardcode colors/type/spacing/radii/shadows; sentence case except mono tags;
  no emoji beyond `✓ → … ✦`.

## Architecture

No data layer, no `lib/settings.ts`, no test file: the screen is presentational
with no pure logic worth table-driving. The shared-contract group name is the
only "data", and it's a constant. When #41 lands, *that's* when a tested
`lib/settings.ts` (payload shaping/validation, like `members.ts`/`club.ts`)
earns its place.

### `lib/api.ts` — add the group-name contract constant

```ts
// GROUP_NAME is the seeded "Friday Film Club" group's display name — part of
// the same shared seed contract as GROUP_ID. Rendered until a group-read
// endpoint exists (→ #41); then this is swapped for a fetch (gaining "since").
export const GROUP_NAME = "Friday Film Club";
```

### New component: `components/SettingsRow.tsx`

The single grouped-row primitive; exported from `components/index.ts`.

```ts
SettingsRow({
  label: string,        // sentence-case row title
  value?: string,       // optional right-aligned mono value
  right?: ReactNode,    // optional right slot (Toggle / chevron); wins over value
  onPress?: () => void, // pressable (chevron rows) when set
  disabled?: boolean,   // dims (~0.45) + blocks press — the no-backend rows
  danger?: boolean,     // red label ink (danger zone)
})
```

- Layout mirrors `MemberRow`: `flexDirection: "row"`, `alignItems: "center"`,
  `paddingVertical: space[3]`, `paddingHorizontal: space[4]`; label is
  `textPresets.body` in `colors.text.primary`; optional `value` is mono
  (`fontFamily.mono`, `fontSize.caption`) in `colors.text.tertiary`.
- `danger` → label `colors.text.danger`. `disabled` → `opacity: 0.45`, renders
  as a plain `View` (no `Pressable`), `accessibilityState={{ disabled: true }}`.
- Pressable variant uses `pressedOpacity` like `MemberRow`.
- The row draws **no** card/border itself — grouping (card + dividers) is the
  screen's job, so the same row works in every group.

### Screen: `app/(tabs)/settings.tsx`

`TopBar kind="tab" title="Settings"` over a `ScrollView` (no loading/error
states — nothing is fetched). Two local booleans hold toggle state:

```ts
const [allowSkipping, setAllowSkipping] = useState(true);   // skip exists in-app
const [guestsCanPick, setGuestsCanPick] = useState(false);  // the house rule
```

Content, top to bottom:

1. **House-rule card** — its own card (`surface.card`, `radius.lg`,
   `padding space[5]`). Mono uppercase `THE HOUSE RULE` (SectionLabel-style:
   `fontFamily.monoBold`, `fontSize.caption`, `text.tertiary`, tracked) over
   serif `One pick a night. No voting, no vetoing.` (`textPresets.screenTitle`,
   `text.primary`). Ember-free — a quiet hero, not a spotlight.
2. **Notice `Banner`** (`tone="info"`): `Settings aren't saved yet — changes
   reset when you reopen the app.`
3. **GROUP** (`SectionLabel`) → card, one static row:
   `SettingsRow label={GROUP_NAME}` (no `onPress`, no value, no "since").
4. **ROTATION** → card, two `SettingsRow`s with a `Toggle` in `right`:
   - `Allow skipping` — `right={<Toggle value={allowSkipping} onValueChange={setAllowSkipping} />}`
   - `Guests can pick` — `right={<Toggle value={guestsCanPick} onValueChange={setGuestsCanPick} />}`
5. **NOTIFICATIONS** → card, one **disabled** row `Reminders & nudges` with a
   dimmed `ChevronRight` (lucide) in `right`.
6. **DANGER ZONE** → card, two **disabled `danger`** rows: `Reset history`,
   `Leave group`.

Grouping markup follows `club.tsx`: a card `View` (`surface.card`, `radius.lg`,
`overflow: "hidden"`) wrapping rows, with `border.hairline` bottom-border
dividers between rows (not after the last). A `TODO(#41)` comment sits above the
toggle state noting persistence + Danger-zone wiring land there.

## Behavior

- Toggles flip locally and immediately; no network, no persistence — reset on
  reload. Disabled rows ignore taps.
- No empty/loading/error branches (nothing is fetched).

## Testing / verification

- `cd mobile && just check` (lint + typecheck + existing tests) is the gate.
  No new unit tests — there is no pure logic to test.
- Manual: run Expo, open the Settings tab, confirm: house-rule card renders;
  notice banner shows; Group row shows "Friday Film Club"; both Rotation
  toggles flip; Notifications + Danger-zone rows look disabled and don't react;
  Danger-zone labels are red.

## Out of scope (later issues)

- `GET /groups/{groupId}` read endpoint + real name/"since" — future Phase 2.
- Settings persistence / house-rule editing — #41.
- Notification scheduling (`expo-notifications`) — #50.
- Functional Reset history / Leave group actions — need backend, unscheduled.
