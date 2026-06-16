# Spotlight Redesign — PR1: Foundation + Primitives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the visual foundation (lucide icons + brand logomark component) and the token-driven UI primitives (Avatar, Button, Badge, Input, Toggle, MemberRow, Poster, Stat, SectionLabel, Banner, IconButton) the redesigned screens compose from.

**Architecture:** Pure presentational RN components in `mobile/components/`, each importing only from `mobile/theme/` (zero hardcoded tokens). The only unit-testable logic is the avatar tint/initials helper, which lives in `mobile/lib/avatar.ts` and gets a table-driven test (repo convention: pure functions only, no component tests). A barrel `components/index.ts` keeps screen imports clean.

**Tech Stack:** Expo SDK 56, React Native 0.86, TypeScript 6, expo-router, react-native-svg (already wired), lucide-react-native (added here). Tests via `node:test` + `tsx`.

**User decisions (already made):**
- "I want to do everything … start … first on the mobile redesign with the existing API only."
- "Visual redesign first, scheduling next." / Native APIs: "Defer entirely."
- PR slicing: "Several small PRs" — this is PR1 (foundation + primitives, issues #29 + #30).
- Build order: "Foundation-up."
- Spec approved: `docs/superpowers/specs/2026-06-16-spotlight-redesign-phase1-design.md`.

**Already in place (do NOT rebuild):** Fonts are loaded in `app/_layout.tsx` via `useFonts` with local TTFs whose keys already match `theme/typography.ts`. The SVG transformer (`metro.config.js`), `svg.d.ts`, `react-native-svg`, and brand SVGs (`assets/brand/logomark.svg`, `logomark-mono.svg`, `app-icon.svg`) all exist. The full token set is in `theme/`.

**Out of scope for PR1:** Shared chrome (top bars, tab bar), the tab navigator, and any screen — those are PR2 (#31+). DateChip and Calendar are Phase 3.

---

## File structure

- `mobile/components/Logomark.tsx` — wraps the brand SVG at a given size (foundation, #29).
- `mobile/lib/avatar.ts` — pure `avatarTint(name)` + `initials(name)` (#30).
- `mobile/lib/avatar.test.ts` — table-driven tests for the above.
- `mobile/theme/colors.ts` — add `avatarTints` (the 7 logo-ring jewel colors). MODIFY.
- `mobile/components/Avatar.tsx` — initials chip with deterministic tint + optional ember glow ring.
- `mobile/components/AppButton.tsx` — MODIFY: add `ghost` + `danger` variants and a `fullWidth` prop.
- `mobile/components/Badge.tsx` — mono/solid/neutral/muted/danger status badge.
- `mobile/components/Input.tsx` — text input with optional trailing addon button.
- `mobile/components/Toggle.tsx` — 44×26 pill switch.
- `mobile/components/MemberRow.tsx` — rank + avatar + name + mono meta row, spotlight variant.
- `mobile/components/Poster.tsx` — TMDB image with hue-gradient fallback tile.
- `mobile/components/Stat.tsx` — mono value + caption tile.
- `mobile/components/SectionLabel.tsx` — mono uppercase section label.
- `mobile/components/Banner.tsx` — info/danger strip.
- `mobile/components/IconButton.tsx` — square tappable icon affordance.
- `mobile/components/index.ts` — barrel re-exporting all primitives.

All components: press feedback = opacity dip to `pressedOpacity` (0.72), no scale/bounce; reference semantic token groups only.

---

### Task 0: Foundation — lucide icons + Logomark component

**Goal:** Add the icon library and a reusable brand logomark component; confirm fonts already render.

**Files:**
- Create: `mobile/components/Logomark.tsx`
- Modify: `mobile/package.json` (via `expo install`)

**Acceptance Criteria:**
- [ ] `lucide-react-native` resolves and an icon renders without a runtime error.
- [ ] `<Logomark size={30} />` renders `assets/brand/logomark.svg` at 30×30.
- [ ] `just check` passes (lint + typecheck + tests).

**Verify:** `cd mobile && just check` → no errors; `npx tsc --noEmit` clean.

**Steps:**

- [ ] **Step 1: Install lucide**

```bash
cd mobile && npx expo install lucide-react-native
```
Expected: adds `lucide-react-native` to `package.json` dependencies. (`react-native-svg`, its peer, is already present.)

- [ ] **Step 2: Create the Logomark component**

Create `mobile/components/Logomark.tsx`:

```tsx
import Mark from "../assets/brand/logomark.svg";

// Logomark renders the Spotlight brand mark (the ring of friends with tonight's
// picker glowing ember at top). The SVG is the source of truth — never redraw it.
// Imported as a component via react-native-svg-transformer (see metro.config.js).
export function Logomark({ size = 30 }: { size?: number }) {
  return <Mark width={size} height={size} />;
}
```

- [ ] **Step 3: Verify**

Run: `cd mobile && just check`
Expected: PASS (lint + typecheck + tests green).

- [ ] **Step 4: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/components/Logomark.tsx
git commit -m "feat(mobile): add lucide icons and a brand Logomark component (#29)"
```

---

### Task 1: Avatar tint/initials helper (pure, tested)

**Goal:** Deterministic `avatarTint(name)` and `initials(name)` so a given person is always the same color and monogram.

**Files:**
- Modify: `mobile/theme/colors.ts` (add `avatarTints`)
- Create: `mobile/lib/avatar.ts`
- Test: `mobile/lib/avatar.test.ts`

**Acceptance Criteria:**
- [ ] `avatarTints` holds the 7 logo-ring jewel hexes.
- [ ] `avatarTint(name)` returns the same tint for the same name, distributes across the 7, and never returns undefined.
- [ ] `initials(name)` → 1–2 uppercase letters; handles single names, multi-word names, extra whitespace, and empty string (`"?"`).
- [ ] Table-driven tests pass.

**Verify:** `cd mobile && node --import tsx --test lib/avatar.test.ts` → all tests pass.

**Steps:**

- [ ] **Step 1: Add the ring tints to the theme**

In `mobile/theme/colors.ts`, append after the `colors` object (before the final newline):

```ts
// --- Avatar tints — the seven jewel friends of the logo ring (assets/brand/logomark.svg).
// A name hashes to one of these so a person is always the same color (no photos).
export const avatarTints = [
  "#F4B36A", // warm gold
  "#EC92AC", // rose
  "#D79BD6", // orchid
  "#B79BEA", // violet
  "#9DA8EE", // periwinkle
  "#8C9CEC", // moon
  "#6FC6D6", // teal
] as const;
```

- [ ] **Step 2: Write the failing test**

Create `mobile/lib/avatar.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { avatarTint, initials } from "./avatar";
import { avatarTints } from "../theme/colors";

test("avatarTint is deterministic for the same name", () => {
  assert.equal(avatarTint("Alex Rivera"), avatarTint("Alex Rivera"));
});

test("avatarTint always returns a ring tint", () => {
  for (const name of ["Alex", "Tomas", "Priya", "Sam", "", "  "]) {
    assert.ok((avatarTints as readonly string[]).includes(avatarTint(name)));
  }
});

test("avatarTint distributes across more than one tint", () => {
  const names = ["Alex", "Tomas", "Priya", "Sam", "Noor", "Kai", "Mia", "Leo"];
  const used = new Set(names.map(avatarTint));
  assert.ok(used.size > 1);
});

test("initials handles the common cases", () => {
  const cases: [string, string][] = [
    ["Alex Rivera", "AR"],
    ["Tomas", "T"],
    ["  priya  patel ", "PP"],
    ["madonna", "M"],
    ["Jean-Luc Picard", "JP"],
    ["", "?"],
    ["   ", "?"],
  ];
  for (const [input, want] of cases) {
    assert.equal(initials(input), want, `initials(${JSON.stringify(input)})`);
  }
});
```

- [ ] **Step 2b: Run test to verify it fails**

Run: `cd mobile && node --import tsx --test lib/avatar.test.ts`
Expected: FAIL — cannot find module `./avatar`.

- [ ] **Step 3: Implement the helper**

Create `mobile/lib/avatar.ts`:

```ts
import { avatarTints } from "../theme/colors";

// avatarTint maps a name to one of the seven logo-ring jewel tints, deterministically,
// so a person is always the same color across the app. Sum of char codes keeps it
// pure and stable (no Math.random / no persisted state).
export function avatarTint(name: string): string {
  const key = name.trim();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash + key.charCodeAt(i)) % avatarTints.length;
  }
  return avatarTints[hash];
}

// initials returns a 1–2 letter uppercase monogram: the first letter of the first
// two whitespace-separated words. Empty / whitespace-only names render "?".
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  const letters = words.slice(0, 2).map((w) => w[0]);
  return letters.join("").toUpperCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && node --import tsx --test lib/avatar.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/theme/colors.ts mobile/lib/avatar.ts mobile/lib/avatar.test.ts
git commit -m "feat(mobile): deterministic avatar tint + initials helper (#30)"
```

---

### Task 2: Avatar component

**Goal:** An initials chip with the deterministic tint and an optional ember glow ring (the "next up" treatment).

**Files:**
- Create: `mobile/components/Avatar.tsx`

**Acceptance Criteria:**
- [ ] Renders a `full`-radius chip filled with `avatarTint(name)`, dark ink initials centered.
- [ ] `size` controls diameter; font scales to ~42% of size.
- [ ] `glow` adds an ember ring (`shadow.spotlight` + 1px ember border).
- [ ] No hardcoded tokens.

**Verify:** `cd mobile && just typecheck` → clean.

**Steps:**

- [ ] **Step 1: Implement Avatar**

Create `mobile/components/Avatar.tsx`:

```tsx
import { StyleSheet, Text, View } from "react-native";

import { borderWidth, colors, fontFamily, radius, shadow } from "../theme";
import { avatarTint, initials } from "../lib/avatar";

// Avatar is a deterministic initials chip (no photos): the name hashes to one of the
// logo-ring jewel tints. `glow` gives it the ember "next up" ring used on the picker.
export function Avatar({
  name,
  size = 40,
  glow = false,
}: {
  name: string;
  size?: number;
  glow?: boolean;
}) {
  const tint = avatarTint(name);
  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: radius.full,
          backgroundColor: tint,
        },
        glow && styles.glow,
      ]}
    >
      <Text
        style={[
          styles.label,
          { fontSize: Math.round(size * 0.42) },
        ]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  glow: {
    borderWidth: borderWidth.hairline,
    borderColor: colors.accent.base,
    ...shadow.spotlight,
  },
  label: {
    fontFamily: fontFamily.sansBold,
    color: "#1A1228", // deep-night ink reads on every jewel tint
  },
});
```

> Note: the ink color is intentionally the same `text.onAccent` ink the theme uses on the ember CTA; it is referenced here as a literal because `colors.text.onAccent` is that value and the chip backgrounds are brand ring colors, not a single semantic surface. If you prefer, swap to `colors.text.onAccent`.

Prefer the token: change `color: "#1A1228"` to `color: colors.text.onAccent` to satisfy "no hardcoded tokens".

- [ ] **Step 2: Verify**

Run: `cd mobile && just typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/Avatar.tsx
git commit -m "feat(mobile): Avatar initials chip with deterministic tint (#30)"
```

---

### Task 3: Button — add ghost + danger variants and fullWidth

**Goal:** Extend the existing `AppButton` to cover all four redesign variants without breaking current callers.

**Files:**
- Modify: `mobile/components/AppButton.tsx`

**Acceptance Criteria:**
- [ ] `variant` accepts `"primary" | "secondary" | "ghost" | "danger"`.
- [ ] `ghost` = transparent, no border, ember (`accent.strong`) label.
- [ ] `danger` = transparent with a `feedback.danger` label (used for "Cancel this night", "Leave group").
- [ ] New optional `fullWidth` prop stretches the button.
- [ ] Existing `primary`/`secondary` rendering is unchanged; existing callers still compile.

**Verify:** `cd mobile && just check` → clean (existing screens that import AppButton still build).

**Steps:**

- [ ] **Step 1: Replace the component body**

Replace the contents of `mobile/components/AppButton.tsx` with:

```tsx
import { Pressable, StyleSheet, Text } from "react-native";

import {
  borderWidth,
  colors,
  fontFamily,
  pressedOpacity,
  radius,
  shadow,
  space,
  textPresets,
} from "../theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

// AppButton is the Spotlight button. RN's built-in <Button> can't express the
// brand CTA, so screens use this. Logic stays in the screens; presentation only.
//   primary   = ember fill (accent.base) with deep-night ink — the marquee CTA
//   secondary = transparent with a moonlight (accent.cool) outline label
//   ghost     = transparent, ember label, no border — inline secondary action
//   danger    = transparent, red label — destructive action
export function AppButton({
  title,
  onPress,
  disabled = false,
  variant = "primary",
  fullWidth = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: Variant;
  fullWidth?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        styles[variant],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.label, labelStyles[variant]]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: space[3],
    paddingHorizontal: space[5],
    alignItems: "center",
    justifyContent: "center",
  },
  fullWidth: { alignSelf: "stretch" },
  primary: { backgroundColor: colors.accent.base, ...shadow.sm },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.strong,
  },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: "transparent" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: pressedOpacity },
  label: { ...textPresets.body, fontFamily: fontFamily.sansSemibold },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.text.onAccent },
  secondary: { color: colors.accent.cool },
  ghost: { color: colors.accent.strong },
  danger: { color: colors.feedback.danger },
});
```

- [ ] **Step 2: Verify existing callers still build**

Run: `cd mobile && just check`
Expected: PASS — `app/index.tsx` / `app/night.tsx` / `app/manage.tsx` (which use `variant="primary"|"secondary"`) still compile.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/AppButton.tsx
git commit -m "feat(mobile): add ghost/danger button variants and fullWidth (#30)"
```

---

### Task 4: Badge

**Goal:** The mono "ticket-stub" status badge used for NEXT UP, CORE, RECORDED ✓, Guest, OUT, ✓ In, etc.

**Files:**
- Create: `mobile/components/Badge.tsx`

**Acceptance Criteria:**
- [ ] `tone` ∈ `"solid" | "ember" | "neutral" | "muted" | "danger"`.
- [ ] `solid` = ember fill + `text.onAccent` ink (e.g. ✓ In, RECORDED ✓). Others are text-on-pill.
- [ ] Mono, uppercase, `tracking.caption` by default (the app's only uppercase). `uppercase={false}` opt-out for mixed-case pills like "✓ In".
- [ ] Pill shape (`radius.full`), no hardcoded tokens.

**Verify:** `cd mobile && just typecheck` → clean.

**Steps:**

- [ ] **Step 1: Implement Badge**

Create `mobile/components/Badge.tsx`:

```tsx
import { StyleSheet, Text, View } from "react-native";

import { colors, fontFamily, fontSize, radius, space, trackPx } from "../theme";

type Tone = "solid" | "ember" | "neutral" | "muted" | "danger";

// Badge is the mono ticket-stub status tag (NEXT UP, CORE, RECORDED ✓, Guest, OUT).
// Uppercase mono is the app's only uppercase. `solid` is the filled ember pill.
export function Badge({
  label,
  tone = "ember",
  uppercase = true,
}: {
  label: string;
  tone?: Tone;
  uppercase?: boolean;
}) {
  return (
    <View style={[styles.base, fills[tone]]}>
      <Text
        style={[
          styles.label,
          texts[tone],
          uppercase && styles.uppercase,
        ]}
        allowFontScaling={false}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: radius.full,
  },
  label: {
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.caption,
    letterSpacing: trackPx(fontSize.caption, "caption"),
  },
  uppercase: { textTransform: "uppercase" },
});

const fills = StyleSheet.create({
  solid: { backgroundColor: colors.accent.base },
  ember: { backgroundColor: colors.surface.spotlight },
  neutral: { backgroundColor: colors.surface.subtle },
  muted: { backgroundColor: "transparent" },
  danger: { backgroundColor: colors.surface.danger },
});

const texts = StyleSheet.create({
  solid: { color: colors.text.onAccent },
  ember: { color: colors.accent.strong },
  neutral: { color: colors.text.secondary },
  muted: { color: colors.text.tertiary },
  danger: { color: colors.feedback.danger },
});
```

- [ ] **Step 2: Verify**

Run: `cd mobile && just typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/Badge.tsx
git commit -m "feat(mobile): Badge status tag primitive (#30)"
```

---

### Task 5: Input

**Goal:** A themed text input (search a film, name a member) with an optional trailing addon button.

**Files:**
- Create: `mobile/components/Input.tsx`

**Acceptance Criteria:**
- [ ] `surface.subtle` field, `radius.md`, hairline border, `text.primary` text, `text.tertiary` placeholder.
- [ ] Focus state shows `border.focus` (ember).
- [ ] Optional `addonLabel` + `onAddonPress` render a trailing ember button inside the field row (the "Search" addon).
- [ ] Forwards `value`, `onChangeText`, `placeholder`, `autoFocus`, `onSubmitEditing`.

**Verify:** `cd mobile && just typecheck` → clean.

**Steps:**

- [ ] **Step 1: Implement Input**

Create `mobile/components/Input.tsx`:

```tsx
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  borderWidth,
  colors,
  fontFamily,
  pressedOpacity,
  radius,
  space,
  textPresets,
} from "../theme";

// Input is the Spotlight text field. With `addonLabel` it grows a trailing ember
// button (the "Search" affordance on the film-search field).
export function Input({
  value,
  onChangeText,
  placeholder,
  autoFocus = false,
  onSubmitEditing,
  addonLabel,
  onAddonPress,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  addonLabel?: string;
  onAddonPress?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, focused && styles.focused]}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.tertiary}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType={addonLabel ? "search" : "done"}
      />
      {addonLabel ? (
        <Pressable
          onPress={onAddonPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addon, pressed && styles.pressed]}
        >
          <Text style={styles.addonLabel}>{addonLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface.subtle,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
    paddingLeft: space[4],
    paddingRight: space[1],
    minHeight: 48,
  },
  focused: { borderColor: colors.border.focus },
  input: {
    flex: 1,
    ...textPresets.body,
    color: colors.text.primary,
    paddingVertical: space[3],
  },
  addon: {
    backgroundColor: colors.accent.base,
    borderRadius: radius.sm,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    marginLeft: space[2],
  },
  pressed: { opacity: pressedOpacity },
  addonLabel: {
    ...textPresets.meta,
    fontFamily: fontFamily.sansSemibold,
    color: colors.text.onAccent,
  },
});
```

- [ ] **Step 2: Verify**

Run: `cd mobile && just typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/Input.tsx
git commit -m "feat(mobile): Input field with optional addon button (#30)"
```

---

### Task 6: Toggle

**Goal:** The 44×26 pill switch used in Settings and attendance/Reminders rows.

**Files:**
- Create: `mobile/components/Toggle.tsx`

**Acceptance Criteria:**
- [ ] 44×26 pill; track is `accent.base` when on, `palette.night[600]` (neutral toggle-off) when off; white knob.
- [ ] Knob slides on/off; tapping calls `onValueChange(!value)`.
- [ ] `accessibilityRole="switch"` with `accessibilityState`.

**Verify:** `cd mobile && just typecheck` → clean.

**Steps:**

- [ ] **Step 1: Implement Toggle**

Create `mobile/components/Toggle.tsx`:

```tsx
import { Pressable, StyleSheet, View } from "react-native";

import { colors, palette, pressedOpacity, radius } from "../theme";

// Toggle is the 44×26 Spotlight switch: ember track when on, neutral night-600 off.
export function Toggle({
  value,
  onValueChange,
  disabled = false,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        styles.track,
        { backgroundColor: value ? colors.accent.base : palette.night[600] },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 44,
    height: 26,
    borderRadius: radius.full,
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: "#FFFFFF",
  },
  knobOn: { alignSelf: "flex-end" },
  knobOff: { alignSelf: "flex-start" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: pressedOpacity },
});
```

- [ ] **Step 2: Verify**

Run: `cd mobile && just typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/Toggle.tsx
git commit -m "feat(mobile): Toggle pill switch (#30)"
```

---

### Task 7: MemberRow

**Goal:** The rank + avatar + name + mono-meta row used by Tonight's On deck, The order, and The Club, with a spotlight variant for the next-up member.

**Files:**
- Create: `mobile/components/MemberRow.tsx`

**Acceptance Criteria:**
- [ ] Renders optional mono `rank`, an `Avatar`, a serif `name`, and a mono `meta` line.
- [ ] `spotlight` variant adds the `surface.spotlight` wash + 1px ember inset border + `shadow.spotlight` (the "next up" treatment).
- [ ] Optional `right` slot (badge or chevron) and optional `onPress` (press dip).
- [ ] No hardcoded tokens.

**Verify:** `cd mobile && just typecheck` → clean.

**Steps:**

- [ ] **Step 1: Implement MemberRow**

Create `mobile/components/MemberRow.tsx`:

```tsx
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  radius,
  shadow,
  space,
  textPresets,
  trackPx,
} from "../theme";
import { Avatar } from "./Avatar";

// MemberRow is the shared roster row. `spotlight` gives the next-up member the ember
// "whose turn" treatment used across Tonight, The order, and The Club.
export function MemberRow({
  name,
  meta,
  rank,
  spotlight = false,
  avatarSize = 40,
  right,
  onPress,
}: {
  name: string;
  meta?: string;
  rank?: number;
  spotlight?: boolean;
  avatarSize?: number;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <>
      {rank != null ? <Text style={styles.rank}>{rank}</Text> : null}
      <Avatar name={name} size={avatarSize} glow={spotlight} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, spotlight && styles.spotlight]}>{content}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        spotlight && styles.spotlight,
        pressed && styles.pressed,
      ]}
    >
      {content}
    </Pressable>
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
  spotlight: {
    backgroundColor: colors.surface.spotlight,
    borderWidth: borderWidth.hairline,
    borderColor: colors.accent.base,
    ...shadow.spotlight,
  },
  pressed: { opacity: 0.72 },
  rank: {
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    width: 20,
    textAlign: "center",
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...textPresets.rowName, color: colors.text.primary },
  meta: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    letterSpacing: trackPx(fontSize.caption, "normal"),
  },
  right: { marginLeft: space[2] },
});
```

- [ ] **Step 2: Verify**

Run: `cd mobile && just typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/MemberRow.tsx
git commit -m "feat(mobile): MemberRow with spotlight next-up variant (#30)"
```

---

### Task 8: Poster

**Goal:** The movie poster tile — a real TMDB image when available, falling back to the prototype's hue-per-title gradient tile while loading or when there is no art.

**Files:**
- Create: `mobile/components/Poster.tsx`

**Acceptance Criteria:**
- [ ] Given a `uri`, shows the image at `w`×`h` with `radius.sm` and a hairline inset border.
- [ ] With no `uri` (or while the image is loading/errored), shows a gradient fallback derived from a `hue` (0–360) with the title in serif when the tile is tall enough (`h >= 104`), else a centered `film` glyph.
- [ ] Uses `expo-linear-gradient` for the fallback gradient.
- [ ] No hardcoded theme tokens (gradient HSL is content-derived, not a brand token).

**Verify:** `cd mobile && just typecheck` → clean.

**Steps:**

- [ ] **Step 1: Ensure the gradient dep is present**

```bash
cd mobile && npx expo install expo-linear-gradient
```
Expected: adds `expo-linear-gradient` (Expo-managed, SDK-matched).

- [ ] **Step 2: Implement Poster**

Create `mobile/components/Poster.tsx`:

```tsx
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Film } from "lucide-react-native";

import {
  borderWidth,
  colors,
  fontFamily,
  radius,
  trackPx,
} from "../theme";

// Poster shows a real TMDB image when given a `uri`, and otherwise (or while loading /
// on error) the offline hue-per-title gradient tile from the prototype. `hue` is a
// stable 0–360 derived from the title by the caller.
export function Poster({
  uri,
  title = "—",
  year,
  hue = 250,
  w = 56,
  h = 84,
}: {
  uri?: string | null;
  title?: string;
  year?: string | number;
  hue?: number;
  w?: number;
  h?: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = !!uri && !failed;
  const withTitle = h >= 104;

  return (
    <View style={[styles.base, { width: w, height: h }]}>
      {showImage ? (
        <Image
          source={{ uri: uri! }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <LinearGradient
            colors={[`hsl(${hue} 42% 17%)`, `hsl(${hue} 48% 8%)`]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {withTitle ? (
            <View style={styles.caption}>
              <Text style={styles.title} numberOfLines={3}>
                {title}
              </Text>
              {year ? <Text style={styles.year}>{year}</Text> : null}
            </View>
          ) : (
            <View style={styles.center}>
              <Film size={16} color="rgba(241,238,250,0.4)" />
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.sm,
    overflow: "hidden",
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
    backgroundColor: colors.surface.card,
  },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  caption: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 9 },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 16,
    lineHeight: 17,
    color: colors.text.primary,
    letterSpacing: trackPx(16, "display"),
  },
  year: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    color: colors.text.secondary,
    marginTop: 3,
  },
});
```

- [ ] **Step 3: Verify**

Run: `cd mobile && just typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/components/Poster.tsx
git commit -m "feat(mobile): Poster tile with TMDB image + gradient fallback (#30)"
```

---

### Task 9: Stat + SectionLabel

**Goal:** Two small mono primitives: the stat tile (History/profile stat strips) and the uppercase section label.

**Files:**
- Create: `mobile/components/Stat.tsx`
- Create: `mobile/components/SectionLabel.tsx`

**Acceptance Criteria:**
- [ ] `Stat` shows a mono value (22px, bold) over a mono uppercase caption; `accent` renders the value in `accent.strong` (the "Loved" tile, "#N" in line).
- [ ] `SectionLabel` is mono uppercase, `text.tertiary`, `tracking.caption`.
- [ ] No hardcoded tokens.

**Verify:** `cd mobile && just typecheck` → clean.

**Steps:**

- [ ] **Step 1: Implement Stat**

Create `mobile/components/Stat.tsx`:

```tsx
import { StyleSheet, Text, View } from "react-native";

import { colors, fontFamily, fontSize, space, trackPx } from "../theme";

// Stat is a ticket-stub metric: mono value over a mono uppercase caption.
// `accent` turns the value ember (the "Loved" count, "in line" rank).
export function Stat({
  value,
  label,
  accent = false,
}: {
  value: string | number;
  label: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.base}>
      <Text style={[styles.value, accent && styles.accent]} allowFontScaling={false}>
        {value}
      </Text>
      <Text style={styles.label} allowFontScaling={false}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { gap: space[1] },
  value: {
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.xl,
    color: colors.text.primary,
    letterSpacing: -0.22,
  },
  accent: { color: colors.accent.strong },
  label: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    color: colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: trackPx(fontSize.caption, "caption"),
  },
});
```

- [ ] **Step 2: Implement SectionLabel**

Create `mobile/components/SectionLabel.tsx`:

```tsx
import { StyleSheet, Text } from "react-native";

import { colors, fontFamily, fontSize, space, trackPx } from "../theme";

// SectionLabel is the mono uppercase group heading (the app's only uppercase outside badges).
export function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={styles.label} allowFontScaling={false}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: trackPx(fontSize.caption, "caption"),
    marginTop: space[5],
    marginBottom: space[2],
  },
});
```

- [ ] **Step 3: Verify**

Run: `cd mobile && just typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/Stat.tsx mobile/components/SectionLabel.tsx
git commit -m "feat(mobile): Stat tile and SectionLabel primitives (#30)"
```

---

### Task 10: Banner + IconButton + barrel

**Goal:** The info/danger strip, the square icon affordance (the gear / chevron buttons), and a barrel so screens import primitives from one path.

**Files:**
- Create: `mobile/components/Banner.tsx`
- Create: `mobile/components/IconButton.tsx`
- Create: `mobile/components/index.ts`

**Acceptance Criteria:**
- [ ] `Banner` renders a `lg`-radius strip with optional lucide icon + text; `tone` ∈ `"info" | "danger"` (info = `surface.subtle`, danger = `surface.danger` with red text).
- [ ] `IconButton` is a square (default 34) tappable surface that renders a passed lucide icon element, with the press dip and an `accessibilityLabel`.
- [ ] `components/index.ts` re-exports every primitive (Logomark, Avatar, AppButton, Badge, Input, Toggle, MemberRow, Poster, Stat, SectionLabel, Banner, IconButton).
- [ ] No hardcoded tokens.

**Verify:** `cd mobile && just check` → clean (lint + typecheck + tests all green).

**Steps:**

- [ ] **Step 1: Implement Banner**

Create `mobile/components/Banner.tsx`:

```tsx
import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, space, textPresets } from "../theme";

// Banner is the info/fairness strip (The order) and the danger note. `icon` is an
// optional lucide element supplied by the caller.
export function Banner({
  children,
  tone = "info",
  icon,
}: {
  children: string;
  tone?: "info" | "danger";
  icon?: ReactNode;
}) {
  const danger = tone === "danger";
  return (
    <View style={[styles.base, danger ? styles.danger : styles.info]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[styles.text, danger && styles.dangerText]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    padding: space[4],
    borderRadius: radius.lg,
  },
  info: { backgroundColor: colors.surface.subtle },
  danger: { backgroundColor: colors.surface.danger },
  icon: { flexShrink: 0 },
  text: { ...textPresets.meta, color: colors.text.secondary, flex: 1 },
  dangerText: { color: colors.feedback.danger },
});
```

- [ ] **Step 2: Implement IconButton**

Create `mobile/components/IconButton.tsx`:

```tsx
import { ReactNode } from "react";
import { Pressable, StyleSheet } from "react-native";

import {
  borderWidth,
  colors,
  pressedOpacity,
  radius,
} from "../theme";

// IconButton is a square tappable surface for a single lucide icon (the gear in the
// home bar, calendar chevrons, the add-member plus). The icon element is passed in so
// the caller controls glyph, size, and color.
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 34,
  variant = "card",
}: {
  icon: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  variant?: "card" | "ghost";
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size },
        variant === "card" && styles.card,
        pressed && styles.pressed,
      ]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
  },
  pressed: { opacity: pressedOpacity },
});
```

- [ ] **Step 3: Create the barrel**

Create `mobile/components/index.ts`:

```ts
export { Logomark } from "./Logomark";
export { Avatar } from "./Avatar";
export { AppButton } from "./AppButton";
export { Badge } from "./Badge";
export { Input } from "./Input";
export { Toggle } from "./Toggle";
export { MemberRow } from "./MemberRow";
export { Poster } from "./Poster";
export { Stat } from "./Stat";
export { SectionLabel } from "./SectionLabel";
export { Banner } from "./Banner";
export { IconButton } from "./IconButton";
```

- [ ] **Step 4: Verify the whole primitive set**

Run: `cd mobile && just check`
Expected: PASS — lint clean, typecheck clean, `avatar.test.ts` green.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/Banner.tsx mobile/components/IconButton.tsx mobile/components/index.ts
git commit -m "feat(mobile): Banner, IconButton, and components barrel (#30)"
```

---

## Self-review notes

- **Spec coverage:** PR1 covers #29 (lucide + logomark; fonts already wired) and #30 (all listed primitives + the pure avatar helper with a unit test). Chrome/tab-bar deferred to PR2 as the spec's PR slicing dictates.
- **No component tests beyond the avatar helper:** intentional — repo convention is table-driven tests over pure functions, not RN component snapshots. Component tasks verify via `just check` (lint + typecheck) and manual render in PR2 when they first appear on a screen.
- **Type consistency:** `avatarTint`/`initials` names are stable across Tasks 1–2 and 7; `AppButton` keeps its name and existing `variant` values; `Badge` tones and `MemberRow.spotlight` are referenced consistently.
- **Token discipline:** the only literals are content-derived (poster HSL, the `#FFFFFF` knob, the absolute letter-spacing on Stat) and the avatar ink, which the plan flags to swap to `colors.text.onAccent`.

## PR wrap-up (after Task 10)

- [ ] `cd mobile && just check` green.
- [ ] Open the PR: `gh pr create` — title `feat(mobile): Spotlight foundation + UI primitives`, body closing `#29` and `#30` and referencing the epic `#28`. (Squash-merge repo: write a standalone title/body.)
