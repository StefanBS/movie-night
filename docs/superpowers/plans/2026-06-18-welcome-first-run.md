# Welcome / first-run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Spotlight first-run / Welcome marquee screen (`app/welcome.tsx`) plus a `resolveGroupId()` resolution seam, presentational and wired to existing API only.

**Architecture:** A centered marquee on the night-950 backdrop with an ember top glow (reusing the Tonight hero's RadialGradient), a logomark + serif wordmark, a `HOW IT WORKS` rules card, and two disabled onboarding CTAs behind one info `Banner`. Gating is deferred: a `resolveGroupId()` seam in `lib/api.ts` always returns the seeded group today, so the live app never routes to Welcome yet — `/welcome` is a real route reached directly for review.

**Tech Stack:** Expo SDK 56 / React Native, expo-router (file-based routing), react-native-svg (ember glow), react-native-safe-area-context, the `theme/` token system and `components/` primitives.

**User decisions (already made):**
- "Seam, deferred gating": `resolveGroupId()` always returns the seeded group; build `/welcome` as a real route + TODO seam; no redirect wiring yet.
- "Disabled + info banner": both CTAs disabled, one info `Banner` ("Creating and joining groups is coming soon.").
- "no tagline" — drop the tagline; layout is logomark → wordmark → rules card → buttons.
- Rules card approved verbatim; label is `HOW IT WORKS`.
- Tabs/screens keep importing `GROUP_ID` directly this phase; only `resolveGroupId()` is added (not routed through yet).
- No new unit tests (presentational + trivial seam); `cd mobile && just check` is the gate.

---

## File Structure

- `mobile/lib/api.ts` — **modify.** Add the `resolveGroupId()` resolution seam beside `GROUP_ID` / `GROUP_NAME`. No behavior change.
- `mobile/app/welcome.tsx` — **create.** The first-run marquee screen (presentational).
- `mobile/app/_layout.tsx` — **modify.** Register `welcome` as a headerless `Stack.Screen`.

No `lib/` module, no test file: the screen is presentational and the seam is a constant return — no pure logic to table-drive (mirrors Settings #37). Per the spec, TDD's red-green cycle does not apply here; verification is `just check`.

---

### Task 1: Add the group-resolution seam to `lib/api.ts`

**Goal:** Add `resolveGroupId()` — the documented seam for "which group is active, or null → Welcome" — returning the seeded group today, with no behavior change anywhere.

**Files:**
- Modify: `mobile/lib/api.ts` (after the `GROUP_NAME` block, ~line 12)

**Acceptance Criteria:**
- [ ] `resolveGroupId(): string | null` is exported from `lib/api.ts` and returns `GROUP_ID`.
- [ ] A `TODO(group-onboarding)` comment marks where the persisted/selected group and the `null → /welcome` routing will land.
- [ ] No existing screen/import is changed (tabs still import `GROUP_ID` directly).
- [ ] `cd mobile && just check` passes.

**Verify:** `cd mobile && just check` → lint + typecheck + tests pass, no diff outside `lib/api.ts`.

**Steps:**

- [ ] **Step 1: Add the seam function**

In `mobile/lib/api.ts`, immediately after the `GROUP_NAME` export (the line `export const GROUP_NAME = "Friday Film Club";`), insert:

```ts

// resolveGroupId returns the active group, or null when none is resolved (which
// is when the Welcome / first-run screen is shown). Until group create/join
// exists, it always returns the seeded group.
// TODO(group-onboarding): read the persisted/selected group here; a null result
// routes the app to /welcome (no redirect is wired yet — see app/welcome.tsx).
export function resolveGroupId(): string | null {
  return GROUP_ID;
}
```

- [ ] **Step 2: Verify the build is clean**

Run: `cd mobile && just check`
Expected: PASS (lint + typecheck + tests). The new export is unused this phase, which is fine — exported symbols don't trip the unused-var rule.

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/api.ts
git commit -m "feat(mobile): add resolveGroupId seam for first-run gating (#38)"
```

---

### Task 2: Build the Welcome marquee screen + register the route

**Goal:** Create the presentational `app/welcome.tsx` marquee and register it as a headerless route in the root stack, reachable at `/welcome`.

**Files:**
- Create: `mobile/app/welcome.tsx`
- Modify: `mobile/app/_layout.tsx` (add a `Stack.Screen` entry)

**Acceptance Criteria:**
- [ ] `/welcome` renders: night-950 background, ember top glow, 92px logomark, `Movie Night` serif wordmark, a `HOW IT WORKS` card with the 3 rules, an info `Banner`, and two **disabled** CTAs (`Start a group  →` primary, `Enter an invite code` ghost).
- [ ] No tagline is rendered.
- [ ] All colors/type/spacing/radii come from `theme/`; no hardcoded values; the only ember is the glow.
- [ ] The route is registered headerless in `app/_layout.tsx` (the screen renders no `TopBar`).
- [ ] `cd mobile && just check` passes.

**Verify:** `cd mobile && just check` → PASS. Manual: run Expo, navigate to `/welcome`, confirm the layout above; both CTAs look disabled (50% opacity) and don't react to taps.

**Steps:**

- [ ] **Step 1: Create the screen**

Create `mobile/app/welcome.tsx` with exactly:

```tsx
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, Banner, Logomark } from "../components";
import {
  colors,
  fontFamily,
  fontSize,
  radius,
  space,
  textPresets,
  trackPx,
} from "../theme";

// The house rules shown on the first-run marquee. Echoes the in-app house rule
// (Settings) and FAIRNESS_NOTE (rotation), kept here as the screen's own copy.
const RULES = [
  "One pick a night. No voting, no vetoing.",
  "Fewest picks goes first — so everyone gets a fair turn.",
  "Can't make it? Skip your turn and keep your place.",
];

// EmberGlow is the top wash on the night-950 marquee — the same RadialGradient
// pattern as the Tonight hero (app/(tabs)/index.tsx). It is the screen's only
// ember (the disabled CTAs are not at ember rest).
function EmberGlow() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="welcomeWash" cx="50%" cy="0%" rx="80%" ry="55%">
          <Stop offset="0" stopColor={colors.accent.base} stopOpacity={0.22} />
          <Stop offset="1" stopColor={colors.accent.base} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#welcomeWash)" />
    </Svg>
  );
}

// WelcomeScreen is the first-run marquee, shown when no group is resolved (see
// resolveGroupId in lib/api.ts). Presentational this phase: group create/join
// has no backend yet (unscheduled), so both CTAs are disabled behind a notice.
// Reached directly at /welcome for review — not wired into routing yet.
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <EmberGlow />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space[8],
            paddingBottom: insets.bottom + space[8],
          },
        ]}
      >
        <Logomark size={92} />
        <Text style={styles.wordmark}>Movie Night</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel} allowFontScaling={false}>
            HOW IT WORKS
          </Text>
          {RULES.map((rule, i) => (
            <Text key={rule} style={[styles.rule, i > 0 && styles.ruleGap]}>
              {rule}
            </Text>
          ))}
        </View>

        <View style={styles.banner}>
          <Banner tone="info">
            Creating and joining groups is coming soon.
          </Banner>
        </View>

        <View style={styles.actions}>
          <AppButton
            title="Start a group  →"
            fullWidth
            disabled
            onPress={() => {}}
          />
          <AppButton
            title="Enter an invite code"
            variant="ghost"
            fullWidth
            disabled
            onPress={() => {}}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.dark },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space[6],
  },
  wordmark: {
    ...textPresets.heroWordmark,
    color: colors.text.primary,
    marginTop: space[4],
    textAlign: "center",
  },
  card: {
    alignSelf: "stretch",
    backgroundColor: colors.surface.card,
    borderRadius: radius.lg,
    padding: space[5],
    marginTop: space[7],
  },
  cardLabel: {
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: trackPx(fontSize.caption, "caption"),
    marginBottom: space[3],
  },
  rule: { ...textPresets.body, color: colors.text.primary },
  ruleGap: { marginTop: space[3] },
  banner: { alignSelf: "stretch", marginTop: space[6] },
  actions: { alignSelf: "stretch", marginTop: space[6], gap: space[3] },
});
```

- [ ] **Step 2: Register the route**

In `mobile/app/_layout.tsx`, add a headerless screen entry inside `<Stack>`, alongside the other `headerShown: false` screens (e.g. right after the `night/new` line):

```tsx
<Stack.Screen name="welcome" options={{ headerShown: false }} />
```

- [ ] **Step 3: Verify the build is clean**

Run: `cd mobile && just check`
Expected: PASS (lint + typecheck + existing tests).

- [ ] **Step 4: Manual check**

Run: `cd mobile && just start`, then navigate to `/welcome` (deep link, or temporarily point a button at `router.navigate("/welcome")`).
Expected: night-950 marquee with a soft ember glow at the top; 92px logomark; `Movie Night` serif wordmark; `HOW IT WORKS` card with the 3 rules; info banner; both CTAs visibly disabled and unresponsive.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/welcome.tsx mobile/app/_layout.tsx
git commit -m "feat(mobile): Welcome / first-run marquee screen (#38)"
```

---

## Self-Review

**Spec coverage:**
- Resolution seam (`resolveGroupId()`) → Task 1. ✓
- Route registration (headerless) → Task 2, Step 2. ✓
- Marquee: night-950 + ember glow + logomark 92px + wordmark + no tagline + rules card (`HOW IT WORKS` + 3 rules) + info banner + disabled primary/ghost CTAs → Task 2, Step 1. ✓
- Tokens-only, ember rationed → enforced in the code (all values from `theme/`). ✓
- No new tests, `just check` gate → Verify lines on both tasks. ✓
- Out-of-scope (group backend, redirect wiring, splash polish) → not implemented; reserved by the seam's TODO. ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to" — full code is inline in both tasks. ✓

**Type consistency:** `resolveGroupId(): string | null` (Task 1) referenced by name only in comments (Task 2) — not called yet, so no signature mismatch risk. Component props (`AppButton.onPress` required → no-op passed; `Banner` string child wrapped in a `View` for margin; `Logomark size`) match the verified component APIs. Tokens (`colors.surface.dark`, `colors.surface.card`, `colors.text.primary/tertiary`, `colors.accent.base`, `radius.lg`, `fontSize.caption`, `fontFamily.monoBold`, `textPresets.heroWordmark/body`, `space`, `trackPx`) all exist in `theme/`. ✓
