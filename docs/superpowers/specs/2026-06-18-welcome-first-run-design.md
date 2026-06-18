# Welcome / first-run — design

Date: 2026-06-18
Issue: #38 (Redesign P1.10) · Epic #28 · Phase 1, handoff screen 1
Parent spec: `docs/superpowers/specs/2026-06-16-spotlight-redesign-phase1-design.md`

## Goal

Add the Spotlight **first-run / Welcome** marquee: a centered screen on the
night-950 backdrop with an ember top glow — logomark, "Movie Night" serif
wordmark, a rules card, and the two onboarding CTAs (`Start a group →`,
`Enter an invite code`). It is the screen shown "when no group is resolved".

Like Settings (#37), this is **wired to the existing backend only** — which for
this screen is **nothing**. So it is purely presentational: the CTAs have no
backend (group create/join doesn't exist and isn't yet a scheduled issue) and
are rendered **disabled** behind one info `Banner`.

## Context / constraints

- **Phase 1 = existing API only.** The epic (#28) forbids new endpoints this
  phase. There is no group-create, group-join, invite-code, or onboarding
  persistence backend, and none is scheduled. The CTAs therefore do nothing
  this phase.
- **No real "no group" state yet.** `GROUP_ID` is a hardcoded shared-contract
  constant (`lib/api.ts`) imported across the app; the group is *always*
  resolved. Rather than build persistence/redirect machinery ahead of its
  backend, we add a **resolution seam** (`resolveGroupId()`) that always returns
  the seeded group today. The live app never routes to Welcome yet; `/welcome`
  is a real route reached **directly** for review. Wiring "null → redirect to
  /welcome" is the future seam, landing when `resolveGroupId()` can actually
  return null (a later group-onboarding issue).
- **Seam stays minimal.** The tabs/screens keep importing `GROUP_ID` directly
  (unchanged this phase). Only `resolveGroupId()` is added and documented as the
  seam; nothing is routed through it yet. This keeps zero behavior change and no
  machinery ahead of the backend.
- Follow the parent spec / CLAUDE.md: import all tokens from `theme/`, never
  hardcode colors/type/spacing/radii/shadows; sentence case except mono tags;
  no emoji beyond `✓ → … ✦`. Ember is rationed.

## Architecture

No data layer, no `lib/` module, no test file: the screen is presentational with
no pure logic worth table-driving (mirrors Settings #37). The resolution seam is
a trivial constant return — not worth a unit test until it has real branching.

### `lib/api.ts` — add the group-resolution seam

```ts
// resolveGroupId returns the active group, or null when none is resolved (which
// is when the Welcome / first-run screen is shown). Until group create/join
// exists, it always returns the seeded group. TODO(group-onboarding): read the
// persisted/selected group here; a null result routes to /welcome.
export function resolveGroupId(): string | null {
  return GROUP_ID;
}
```

### `app/_layout.tsx` — register the route

Add a headerless screen to the root `Stack` (it renders its own marquee, no
`TopBar` / Stack header), beside the other `headerShown: false` entries:

```tsx
<Stack.Screen name="welcome" options={{ headerShown: false }} />
```

No redirect wiring is added — see the deferred seam above.

### Screen: `app/welcome.tsx`

A centered marquee — no `TopBar`. Root `View`: `flex: 1`, background
`colors.surface.dark` (night-950), centered content (`SafeAreaView` /
`SafeAreaProvider` insets so it clears the notch and home indicator). Content is
horizontally padded (`space[6]`) and vertically centered.

**Ember top glow.** A full-bleed `react-native-svg` `RadialGradient`
(`cx="50%" cy="0%"`, `colors.accent.base` → transparent), reusing the
`SpotlightHero` `heroWash` pattern from `app/(tabs)/index.tsx`. `pointerEvents="none"`,
`StyleSheet.absoluteFill`. This glow is the only ember on the screen (disabled
CTAs are not at ember rest).

Content, top to bottom, centered:

1. **Logomark** — `<Logomark size={92} />`.
2. **Wordmark** — `Movie Night` in `textPresets.heroWordmark`,
   `colors.text.primary`, centered, `marginTop: space[4]`.
3. *(No tagline.)*
4. **Rules card** — its own card: `colors.surface.card`, `radius.lg`,
   `padding: space[5]`, `marginTop: space[7]`, full width. Inside:
   - Mono uppercase label `HOW IT WORKS`, styled **directly** (not via the
     `SectionLabel` component, which carries its own `marginTop`/`marginBottom`
     that would fight the card padding) — same tokens as `SectionLabel`:
     `fontFamily.monoBold`, `fontSize.caption`, `colors.text.tertiary`,
     `textTransform: "uppercase"`, `letterSpacing: trackPx(fontSize.caption, "caption")`,
     `marginBottom: space[3]`. This mirrors the in-card label approach used by
     the Settings house-rule card (#37).
   - The 3 rules, each `textPresets.body` in `colors.text.primary`, stacked with
     `space[3]` between them (no dividers — a quiet list, not settings rows):
     1. `One pick a night. No voting, no vetoing.`
     2. `Fewest picks goes first — so everyone gets a fair turn.`
     3. `Can't make it? Skip your turn and keep your place.`
5. **Info `Banner`** (`tone="info"`), `marginTop: space[6]`:
   `Creating and joining groups is coming soon.`
6. **Primary CTA** — `AppButton title="Start a group  →"` `fullWidth` `disabled`,
   `marginTop: space[6]`.
7. **Ghost CTA** — `AppButton title="Enter an invite code" variant="ghost"`
   `fullWidth` `disabled`, `marginTop: space[3]`.

`AppButton` already handles its own disabled styling; we do not restyle it.

## Behavior

- Static screen — nothing is fetched; no loading/error/empty branches.
- Both CTAs are disabled and ignore taps. No navigation, no network.
- Not reachable in normal app flow this phase (resolution always returns a
  group); reached directly at `/welcome` for review.

## Testing / verification

- `cd mobile && just check` (lint + typecheck + existing tests) is the gate.
  **No new unit tests** — presentational; `resolveGroupId()` is a constant
  return with no branching to table-drive yet.
- Manual: navigate to `/welcome` (e.g. deep link or temporary nav), confirm:
  night-950 marquee with ember top glow; 92px logomark; `Movie Night` serif
  wordmark; rules card with `HOW IT WORKS` + the 3 rules; info banner shows;
  both CTAs render disabled and don't react.

## Out of scope (later issues)

- Group create / join / invite-code backend + flows (unscheduled).
- Real no-group detection, persistence, and `null → /welcome` redirect wiring
  (a future group-onboarding issue) — the `resolveGroupId()` seam reserves the
  spot.
- Splash / entry animation polish.
