# Settings tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Settings tab placeholder with the full Spotlight Settings UI — house-rule card, Group / Rotation / Notifications / Danger-zone groups — using a new reusable `SettingsRow` primitive, with session-local toggles and no backend.

**Architecture:** Two new units. (1) `SettingsRow`, a presentational grouped-row component (label + optional value / right slot, with `disabled` and `danger` variants) modeled on `MemberRow`. (2) The `settings.tsx` screen composes `SettingsRow` inside cards, holds two `useState` toggle booleans, and renders the group name from a new `GROUP_NAME` shared-contract constant in `lib/api.ts`. No data fetching, no `lib/settings.ts`, no unit tests (presentational, no pure logic).

**Tech Stack:** Expo SDK 56, React Native, TypeScript, `lucide-react-native` icons, the `theme/` token system.

**User decisions (already made):**
- Group card renders the real name from a `GROUP_NAME` constant in `lib/api.ts` (shared seed contract, beside `GROUP_ID`); "since" omitted; no backend endpoint (stay within Phase 1 "existing API only").
- Non-functional controls: toggles flip locally (session-only); Notifications + Danger-zone rows rendered disabled; one info `Banner` flags "not saved yet".
- One reusable `SettingsRow` primitive in `components/`; no `lib/settings.ts` and no test (no pure logic to table-drive).

Full spec: `docs/superpowers/specs/2026-06-18-settings-tab-design.md`

---

## File structure

- **Create** `mobile/components/SettingsRow.tsx` — the grouped-row primitive.
- **Modify** `mobile/components/index.ts` — export `SettingsRow`.
- **Modify** `mobile/lib/api.ts` — add the `GROUP_NAME` contract constant.
- **Rewrite** `mobile/app/(tabs)/settings.tsx` — the screen.

## Testing note

This feature is presentational React Native — the repo's convention is
table-driven unit tests over **pure functions only** (no component/render
tests, no mocks). There is no pure logic here, so **no unit tests are added**.
The gate is `cd mobile && just check` (lint + typecheck + the existing test
suite, which must stay green) plus a manual Expo pass. TDD's red-green cycle
does not apply to these two tasks; each task's "Verify" is the lint/typecheck
gate.

---

### Task 1: `SettingsRow` primitive

**Goal:** Add a reusable grouped-row component (label + optional value / right slot, with `disabled` and `danger` variants) and export it.

**Files:**
- Create: `mobile/components/SettingsRow.tsx`
- Modify: `mobile/components/index.ts`

**Acceptance Criteria:**
- [ ] `SettingsRow` renders a sentence-case `label` (`textPresets.body`, `colors.text.primary`).
- [ ] Optional `value` renders right-aligned in mono (`fontFamily.mono`, `fontSize.caption`, `colors.text.tertiary`); a `right` node, when given, takes the right slot instead of `value`.
- [ ] `onPress` makes the row a `Pressable` with `pressedOpacity`; without it the row is a plain `View`.
- [ ] `disabled` sets `opacity: 0.45`, forces the non-pressable `View`, and sets `accessibilityState={{ disabled: true }}`.
- [ ] `danger` renders the label in `colors.text.danger`.
- [ ] The component draws no card/border/divider itself (grouping is the screen's job).
- [ ] Exported from `components/index.ts`.
- [ ] `just check` passes.

**Verify:** `cd mobile && just check` → lint + typecheck + tests all pass.

**Steps:**

- [ ] **Step 1: Create `mobile/components/SettingsRow.tsx`**

```tsx
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  colors,
  fontFamily,
  fontSize,
  pressedOpacity,
  radius,
  space,
  textPresets,
  trackPx,
} from "../theme";

// SettingsRow is the Settings screen's grouped-row primitive: a sentence-case
// label with an optional right slot — a mono `value`, a `right` node (Toggle /
// chevron), or nothing. `disabled` dims rows whose backend isn't wired yet;
// `danger` is the red Danger-zone ink. Grouping (card + dividers) is the
// caller's job, so the same row works in every group.
export function SettingsRow({
  label,
  value,
  right,
  onPress,
  disabled = false,
  danger = false,
}: {
  label: string;
  value?: string;
  right?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const content = (
    <>
      <Text
        style={[styles.label, danger && styles.dangerLabel]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {right ? (
        <View style={styles.right}>{right}</View>
      ) : value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
    </>
  );

  if (onPress && !disabled) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.row, disabled && styles.disabled]}
      accessibilityState={disabled ? { disabled: true } : undefined}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
  },
  label: { ...textPresets.body, color: colors.text.primary, flex: 1 },
  dangerLabel: { color: colors.text.danger },
  value: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    letterSpacing: trackPx(fontSize.caption, "normal"),
  },
  right: { marginLeft: space[2] },
  disabled: { opacity: 0.45 },
  pressed: { opacity: pressedOpacity },
});
```

- [ ] **Step 2: Export from `mobile/components/index.ts`**

Add this line after the `MemberRow` export (keep the file's existing ordering style):

```ts
export { SettingsRow } from "./SettingsRow";
```

- [ ] **Step 3: Run the gate**

Run: `cd mobile && just check`
Expected: lint, typecheck, and the existing test suite all pass (no new tests).

- [ ] **Step 4: Commit**

```bash
git add mobile/components/SettingsRow.tsx mobile/components/index.ts
git commit -m "feat(mobile): SettingsRow grouped-row primitive (#37)"
```

---

### Task 2: Settings screen

**Goal:** Replace the Settings placeholder with the house-rule card + Group / Rotation / Notifications / Danger-zone groups, wiring session-local toggles and the `GROUP_NAME` constant.

**Files:**
- Modify: `mobile/lib/api.ts`
- Rewrite: `mobile/app/(tabs)/settings.tsx`

**Acceptance Criteria:**
- [ ] `lib/api.ts` exports `GROUP_NAME = "Friday Film Club"` with a contract comment beside `GROUP_ID`.
- [ ] House-rule card: mono uppercase `THE HOUSE RULE` over serif `One pick a night. No voting, no vetoing.` (`textPresets.screenTitle`), ember-free.
- [ ] Info `Banner` reads `Settings aren't saved yet — changes reset when you reopen the app.`
- [ ] GROUP group: one static row showing `GROUP_NAME`; no "since" line, not pressable.
- [ ] ROTATION group: `Allow skipping` (default on) and `Guests can pick` (default off) rows, each with a working `Toggle` bound to local state.
- [ ] NOTIFICATIONS group: one disabled `Reminders & nudges` row with a dimmed `ChevronRight`.
- [ ] DANGER ZONE group: disabled `Reset history` and `Leave group` rows, both `danger` (red labels).
- [ ] Group sections use `SectionLabel` headings; rows sit in cards (`surface.card`, `radius.lg`) with `border.hairline` dividers between rows (not after the last).
- [ ] A `TODO(#41)` comment marks the persistence seam.
- [ ] All colors/type/spacing/radii come from `theme/` (nothing hardcoded); `just check` passes.

**Verify:** `cd mobile && just check` → lint + typecheck + tests all pass. Then manual Expo pass per spec.

**Steps:**

- [ ] **Step 1: Add `GROUP_NAME` to `mobile/lib/api.ts`**

Directly under the existing `GROUP_ID` export (lines 5-6), add:

```ts
// GROUP_NAME is the seeded "Friday Film Club" group's display name — part of
// the same shared seed contract as GROUP_ID. Rendered on the Settings screen
// until a group-read endpoint exists (→ #41), at which point this is swapped
// for a fetch (and the card gains a "since" line).
export const GROUP_NAME = "Friday Film Club";
```

- [ ] **Step 2: Rewrite `mobile/app/(tabs)/settings.tsx`**

Replace the entire file with:

```tsx
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { Banner, SectionLabel, SettingsRow, Toggle, TopBar } from "../../components";
import { GROUP_NAME } from "../../lib/api";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  radius,
  space,
  textPresets,
  trackPx,
} from "../../theme";

export default function SettingsScreen() {
  // TODO(#41): settings persistence + house-rule editing land here. Until the
  // group-settings endpoint exists, toggles are session-local (reset on
  // reload) and the Notifications / Danger-zone rows are inert.
  const [allowSkipping, setAllowSkipping] = useState(true); // skip exists in-app
  const [guestsCanPick, setGuestsCanPick] = useState(false); // the house rule

  return (
    <View style={styles.screen}>
      <TopBar kind="tab" title="Settings" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.ruleCard}>
          <Text style={styles.ruleKicker} allowFontScaling={false}>
            THE HOUSE RULE
          </Text>
          <Text style={styles.ruleText}>
            One pick a night. No voting, no vetoing.
          </Text>
        </View>

        <Banner tone="info">
          Settings aren&apos;t saved yet — changes reset when you reopen the app.
        </Banner>

        <SectionLabel>Group</SectionLabel>
        <View style={styles.card}>
          <SettingsRow label={GROUP_NAME} />
        </View>

        <SectionLabel>Rotation</SectionLabel>
        <View style={styles.card}>
          <View style={styles.divider}>
            <SettingsRow
              label="Allow skipping"
              right={
                <Toggle value={allowSkipping} onValueChange={setAllowSkipping} />
              }
            />
          </View>
          <SettingsRow
            label="Guests can pick"
            right={
              <Toggle value={guestsCanPick} onValueChange={setGuestsCanPick} />
            }
          />
        </View>

        <SectionLabel>Notifications</SectionLabel>
        <View style={styles.card}>
          <SettingsRow
            label="Reminders & nudges"
            disabled
            right={<ChevronRight size={18} color={colors.text.tertiary} />}
          />
        </View>

        <SectionLabel>Danger zone</SectionLabel>
        <View style={styles.card}>
          <View style={styles.divider}>
            <SettingsRow label="Reset history" danger disabled />
          </View>
          <SettingsRow label="Leave group" danger disabled />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  content: { paddingHorizontal: space[5], paddingBottom: space[10] },
  ruleCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radius.lg,
    padding: space[5],
    marginTop: space[6],
    marginBottom: space[4],
    gap: space[2],
  },
  ruleKicker: {
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: trackPx(fontSize.caption, "caption"),
  },
  ruleText: { ...textPresets.screenTitle, color: colors.text.primary },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  divider: {
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
});
```

- [ ] **Step 3: Run the gate**

Run: `cd mobile && just check`
Expected: lint, typecheck, and the existing test suite all pass.

- [ ] **Step 4: Manual verification (Expo)**

Run `cd mobile && just start`, open the Settings tab, and confirm:
- House-rule card renders (mono kicker over serif rule), no ember accent.
- Info banner shows the "not saved yet" message.
- Group row shows "Friday Film Club", no "since".
- Both Rotation toggles flip on tap.
- Notifications + Danger-zone rows look dimmed and don't respond to taps.
- Danger-zone labels are red.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/api.ts mobile/app/\(tabs\)/settings.tsx
git commit -m "feat(mobile): Settings tab — house rule, groups, toggles (#37)"
```

---

## Self-review

- **Spec coverage:** house-rule card → Task 2 step 2; Group/Rotation/Notifications/Danger-zone groups → Task 2; `SettingsRow` primitive → Task 1; `GROUP_NAME` constant → Task 2 step 1; info banner + `TODO(#41)` seam → Task 2; "no lib/settings.ts, no test" → Testing note. All spec sections covered.
- **Placeholder scan:** none — every code step shows complete code.
- **Type consistency:** `SettingsRow` prop names (`label`, `value`, `right`, `onPress`, `disabled`, `danger`) defined in Task 1 are used identically in Task 2. Token names (`borderWidth.hairline`, `radius.lg`, `space[*]`, `colors.*`, `fontFamily.monoBold`, `textPresets.screenTitle`) verified against `theme/`.
