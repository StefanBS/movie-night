# Bottom Tab Navigator + Four Tab Shells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the app's navigation backbone — a bottom tab navigator (Tonight · History · The Club · Settings) with the three shared top-bar kinds and four empty tab shells — keeping the existing `night`/`manage` screens working as parked routes.

**Architecture:** An expo-router `(tabs)` group with a custom blurred tab bar (`expo-router/js-tabs` + a custom `tabBar` over `expo-blur`). Shared chrome lives in one `TopBar` component (`home`/`tab`/`title` kinds). The root `Stack` mounts `(tabs)` headerless plus the parked `night`/`manage` screens. All type/colour values come from `theme/` (new chrome presets added there).

**Tech Stack:** Expo SDK 56, React Native 0.86, TypeScript, expo-router ~56 (`js-tabs`), expo-blur (new), lucide-react-native, react-native-safe-area-context.

**User decisions (already made):**
- "Pure empty shells" — the four tab screens are placeholders; no turn/night/manage content is wired into them this issue.
- "Add expo-blur for real blur" — the tab bar uses `BlurView`, not a solid-fill approximation.
- Old `app/index.tsx` (turn-list) is removed; `night.tsx`/`manage.tsx` are parked as routes (kept working, not linked from the tab nav).

---

## File structure

| File | Responsibility |
|---|---|
| `mobile/package.json` | adds `expo-blur` dependency (Task 1) |
| `mobile/theme/typography.ts` | new chrome text presets: `wordmark`, `tabTitle`, `barTitle`, `backLink`, `tabLabel`, `barMeta` (Task 1) |
| `mobile/theme/colors.ts` | new `surface.tabBar` (night-950 @ 86%) (Task 1) |
| `mobile/components/TopBar.tsx` | shared top-bar chrome, 3 kinds (Task 2) |
| `mobile/components/index.ts` | export `TopBar` (Task 2) |
| `mobile/app/(tabs)/_layout.tsx` | Tabs navigator + custom blurred `SpotlightTabBar` (Task 3) |
| `mobile/app/(tabs)/index.tsx` | Tonight shell (`home` top bar) (Task 3) |
| `mobile/app/(tabs)/history.tsx` | History shell (`tab` top bar) (Task 3) |
| `mobile/app/(tabs)/club.tsx` | The Club shell (`tab` top bar) (Task 3) |
| `mobile/app/(tabs)/settings.tsx` | Settings shell (`tab` top bar) (Task 3) |
| `mobile/app/_layout.tsx` | root Stack: `(tabs)` headerless + parked `night`/`manage` (Task 3) |
| `mobile/app/index.tsx` | **deleted** — `/` route handed to `(tabs)/index.tsx` (Task 3) |

`night.tsx` / `manage.tsx` are **not edited** — they keep working as parked stack routes.

## Conventions (apply to every task)

- Never hardcode colour/type/spacing/radius/shadow — import from `theme/` (`colors`, `space`, `radius`, `textPresets`, …).
- Components are not unit-tested in this repo (table-driven unit tests are for pure `lib/` functions only). The gate is `just check` (lint + typecheck + existing tests) plus a manual smoke at the end.
- Run all `just` commands from `mobile/`.
- lucide icons render as `<Icon size={n} color={...} strokeWidth={2} />` (see `components/Poster.tsx`).

---

### Task 1: Theme chrome presets + expo-blur

**Goal:** Add the type presets and tab-bar surface colour the chrome needs, and install `expo-blur`, so later tasks reference tokens instead of hardcoding.

**Files:**
- Modify: `mobile/theme/typography.ts` (append to `textPresets`)
- Modify: `mobile/theme/colors.ts` (add `surface.tabBar`)
- Modify: `mobile/package.json` (via `expo install`)

**Acceptance Criteria:**
- [ ] `textPresets` exposes `wordmark`, `tabTitle`, `barTitle`, `backLink`, `tabLabel`, `barMeta`.
- [ ] `colors.surface.tabBar` equals `"rgba(12, 10, 27, 0.86)"`.
- [ ] `expo-blur` appears in `mobile/package.json` dependencies.
- [ ] `just typecheck` and `just lint` pass.

**Verify:** `cd mobile && just typecheck && just lint` → no errors; `grep expo-blur package.json` → match.

**Steps:**

- [ ] **Step 1: Install expo-blur (SDK-matched version)**

```bash
cd mobile && npx expo install expo-blur
```
Expected: `package.json` gains `"expo-blur": "~56.x.x"`; lockfile updates.

- [ ] **Step 2: Add the tab-bar surface colour**

In `mobile/theme/colors.ts`, inside the `surface` object, add the line after `dark:`:

```ts
    dark: palette.night[950], // deepest theater / hero / marquee
    tabBar: "rgba(12, 10, 27, 0.86)", // night-950 @ 86% — the blurred bottom tab bar
```

- [ ] **Step 3: Add the chrome text presets**

In `mobile/theme/typography.ts`, append these entries inside `textPresets` (after `tag`, before the closing `} as const;`). Sizes 20/34/24/15/11 are one-off chrome values from the handoff, kept here so screens never hardcode type:

```ts
  // ── App chrome (top bars + tab bar) ──
  // Serif wordmark in the home top bar.
  wordmark: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: lh(20, "tight"),
    letterSpacing: trackPx(20, "display"),
  },
  // Large left-aligned serif title in the `tab` top bar.
  tabTitle: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: lh(34, "tight"),
    letterSpacing: trackPx(34, "display"),
  },
  // Centered serif title in the `title` top bar.
  barTitle: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: lh(24, "tight"),
    letterSpacing: trackPx(24, "display"),
  },
  // Ember back-link beside a `title` top bar.
  backLink: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 15,
    lineHeight: lh(15, "normal"),
  },
  // Bottom tab-bar item label (inactive weight; active swaps to sansBold).
  tabLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 11,
    lineHeight: lh(11, "normal"),
  },
  // Mono sub-line under a top-bar title (group name / count strip).
  barMeta: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    letterSpacing: 11 * 0.04,
  },
```

- [ ] **Step 4: Verify and commit**

```bash
cd mobile && just typecheck && just lint
git add mobile/package.json mobile/package-lock.json mobile/theme/typography.ts mobile/theme/colors.ts
git commit -m "feat(mobile): add expo-blur + chrome type presets and tab-bar surface token (#31)"
```
Expected: typecheck + lint clean; commit succeeds.

---

### Task 2: TopBar shared chrome component

**Goal:** One `TopBar` component implementing all three top-bar kinds (`home`, `tab`, `title`) the issue calls for, exported from the components barrel.

**Files:**
- Create: `mobile/components/TopBar.tsx`
- Modify: `mobile/components/index.ts`

**Acceptance Criteria:**
- [ ] `TopBar` accepts a discriminated `kind` prop: `home` (group + right slot), `tab` (title + optional sub + right slot), `title` (title + optional back link + right slot).
- [ ] `home` renders the `Logomark`, "Movie Night" wordmark, and group name; `tab` renders the large serif title; `title` renders a centered serif title with an ember `ChevronLeft` back link.
- [ ] Top inset uses `useSafeAreaInsets().top` (no hardcoded status-bar height).
- [ ] All colours/type come from `theme/`. `just typecheck` and `just lint` pass.

**Verify:** `cd mobile && just typecheck && just lint` → no errors.

**Steps:**

- [ ] **Step 1: Create `mobile/components/TopBar.tsx`**

```tsx
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Logomark } from "./Logomark";
import { colors, pressedOpacity, space, textPresets } from "../theme";

// The app's shared top-bar chrome, in the three kinds the redesign uses:
//   home  — logomark + "Movie Night" wordmark + group name + right slot (Tonight)
//   tab   — large left-aligned serif title + optional mono sub + right slot
//   title — centered serif title + ember back link + right slot (pushed screens)
type TopBarProps =
  | { kind: "home"; group: string; right?: ReactNode }
  | { kind: "tab"; title: string; sub?: string; right?: ReactNode }
  | {
      kind: "title";
      title: string;
      back?: string;
      onBack?: () => void;
      right?: ReactNode;
    };

export function TopBar(props: TopBarProps) {
  const insets = useSafeAreaInsets();
  const paddingTop = insets.top + space[2];

  if (props.kind === "home") {
    return (
      <View style={[styles.row, { paddingTop }]}>
        <View style={styles.homeLeft}>
          <Logomark size={30} />
          <View style={styles.flexShrink}>
            <Text style={styles.wordmark} allowFontScaling={false}>
              Movie Night
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {props.group}
            </Text>
          </View>
        </View>
        {props.right}
      </View>
    );
  }

  if (props.kind === "tab") {
    return (
      <View style={[styles.row, styles.tabRow, { paddingTop }]}>
        <View style={styles.flexShrink}>
          <Text style={styles.tabTitle} allowFontScaling={false}>
            {props.title}
          </Text>
          {props.sub ? <Text style={styles.meta}>{props.sub}</Text> : null}
        </View>
        {props.right}
      </View>
    );
  }

  return (
    <View style={[styles.titleBar, { paddingTop }]}>
      {props.back ? (
        <Pressable
          onPress={props.onBack}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${props.back}`}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <ChevronLeft size={18} color={colors.accent.strong} strokeWidth={2.4} />
          <Text style={styles.backText}>{props.back}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.barTitle} allowFontScaling={false} numberOfLines={1}>
        {props.title}
      </Text>
      {props.right ? <View style={styles.titleRight}>{props.right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space[5],
    paddingBottom: space[2],
  },
  tabRow: { alignItems: "flex-end" },
  homeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    flexShrink: 1,
  },
  flexShrink: { flexShrink: 1 },
  wordmark: { ...textPresets.wordmark, color: colors.text.primary },
  tabTitle: { ...textPresets.tabTitle, color: colors.text.primary },
  meta: { ...textPresets.barMeta, color: colors.text.tertiary, marginTop: space[1] },
  titleBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[5],
    paddingBottom: space[2],
    minHeight: 44,
  },
  back: {
    position: "absolute",
    left: space[3],
    bottom: space[2],
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
  },
  backText: { ...textPresets.backLink, color: colors.accent.strong },
  barTitle: { ...textPresets.barTitle, color: colors.text.primary },
  titleRight: { position: "absolute", right: space[4], bottom: space[2] },
  pressed: { opacity: pressedOpacity },
});
```

- [ ] **Step 2: Export it from the barrel**

In `mobile/components/index.ts`, add after the `IconButton` export:

```ts
export { IconButton } from "./IconButton";
export { TopBar } from "./TopBar";
```

- [ ] **Step 3: Verify and commit**

```bash
cd mobile && just typecheck && just lint
git add mobile/components/TopBar.tsx mobile/components/index.ts
git commit -m "feat(mobile): TopBar chrome with home/tab/title kinds (#31)"
```
Expected: typecheck + lint clean.

---

### Task 3: Tab navigator, four shells, and root restructure

**Goal:** Introduce the `(tabs)` group with a custom blurred tab bar and four placeholder shells, rewire the root layout to mount `(tabs)` headerless alongside parked `night`/`manage`, and remove the old `index.tsx`. This lands atomically — expo-router rejects two files mapping to `/`, so the migration cannot be split.

**Files:**
- Create: `mobile/app/(tabs)/_layout.tsx`
- Create: `mobile/app/(tabs)/index.tsx`
- Create: `mobile/app/(tabs)/history.tsx`
- Create: `mobile/app/(tabs)/club.tsx`
- Create: `mobile/app/(tabs)/settings.tsx`
- Modify: `mobile/app/_layout.tsx`
- Delete: `mobile/app/index.tsx`

**Acceptance Criteria:**
- [ ] Four tabs (Tonight · History · The Club · Settings) render and switch; the active item is `accent.strong` (ember) with a bold label, inactive is `text.tertiary`.
- [ ] Tab bar uses `BlurView` tinted `surface.tabBar`, with a 1px `border.hairline` top and bottom padding from the safe-area inset.
- [ ] Tonight shows the `home` top bar (gear → Settings); History/Club/Settings show the `tab` top bar; each shell has one honest placeholder line.
- [ ] `night` and `manage` still load as routes (no tab links to them); old `app/index.tsx` is gone.
- [ ] `just check` passes.

**Verify:** `cd mobile && just check` → lint + typecheck + tests pass. Then `just start`, and in the app: switch all four tabs (active = ember), confirm the home/tab bars render, and deep-link `/night` and `/manage` (e.g. type the path in the dev menu / browser for web) to confirm they still load.

**Steps:**

- [ ] **Step 1: Create the tab navigator `mobile/app/(tabs)/_layout.tsx`**

```tsx
import type { ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs, type BottomTabBarProps } from "expo-router/js-tabs";
import { BlurView } from "expo-blur";
import {
  Clapperboard,
  History,
  Settings,
  UsersRound,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { borderWidth, colors, fontFamily, space, textPresets } from "../../theme";

type IconProps = { size: number; color: string; strokeWidth?: number };

// Route name → tab glyph + label. Order here drives the bar order.
const TABS: { name: string; label: string; Icon: ComponentType<IconProps> }[] = [
  { name: "index", label: "Tonight", Icon: Clapperboard },
  { name: "history", label: "History", Icon: History },
  { name: "club", label: "The Club", Icon: UsersRound },
  { name: "settings", label: "Settings", Icon: Settings },
];

function SpotlightTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + space[2] }]}>
      <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.tint} />
      <View style={styles.items}>
        {state.routes.map((route, index) => {
          const tab = TABS.find((t) => t.name === route.name);
          if (!tab) return null;
          const focused = state.index === index;
          const color = focused ? colors.accent.strong : colors.text.tertiary;
          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={tab.label}
              style={styles.item}
            >
              <tab.Icon size={23} color={color} strokeWidth={2} />
              <Text
                allowFontScaling={false}
                style={[styles.label, { color }, focused && styles.labelActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <SpotlightTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="club" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space[2],
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.border.hairline,
    overflow: "hidden",
  },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surface.tabBar },
  items: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
  },
  item: { alignItems: "center", gap: space[1], width: 64 },
  label: { ...textPresets.tabLabel },
  labelActive: { fontFamily: fontFamily.sansBold },
});
```

- [ ] **Step 2: Create the Tonight shell `mobile/app/(tabs)/index.tsx`**

```tsx
import { StyleSheet, Text, View } from "react-native";
import { Settings } from "lucide-react-native";
import { useRouter } from "expo-router";

import { IconButton, TopBar } from "../../components";
import { colors, space, textPresets } from "../../theme";

// Seeded group name (shared contract). A real source arrives with later work.
const GROUP_NAME = "Friday Film Club";

export default function TonightScreen() {
  const router = useRouter();
  return (
    <View style={styles.screen}>
      <TopBar
        kind="home"
        group={GROUP_NAME}
        right={
          <IconButton
            icon={<Settings size={22} color={colors.text.secondary} strokeWidth={2} />}
            onPress={() => router.navigate("/settings")}
            accessibilityLabel="Settings"
            variant="ghost"
          />
        }
      />
      <View style={styles.body}>
        <Text style={styles.placeholder}>
          The whose-turn spotlight arrives in the next update.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  placeholder: { ...textPresets.body, color: colors.text.secondary },
});
```

- [ ] **Step 3: Create the History shell `mobile/app/(tabs)/history.tsx`**

```tsx
import { StyleSheet, Text, View } from "react-native";

import { TopBar } from "../../components";
import { colors, space, textPresets } from "../../theme";

export default function HistoryScreen() {
  return (
    <View style={styles.screen}>
      <TopBar kind="tab" title="History" />
      <View style={styles.body}>
        <Text style={styles.placeholder}>No nights yet — start one.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  placeholder: { ...textPresets.body, color: colors.text.secondary },
});
```

- [ ] **Step 4: Create the Club shell `mobile/app/(tabs)/club.tsx`**

```tsx
import { StyleSheet, Text, View } from "react-native";

import { TopBar } from "../../components";
import { colors, space, textPresets } from "../../theme";

export default function ClubScreen() {
  return (
    <View style={styles.screen}>
      <TopBar kind="tab" title="The Club" />
      <View style={styles.body}>
        <Text style={styles.placeholder}>Members show up here soon.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  placeholder: { ...textPresets.body, color: colors.text.secondary },
});
```

- [ ] **Step 5: Create the Settings shell `mobile/app/(tabs)/settings.tsx`**

```tsx
import { StyleSheet, Text, View } from "react-native";

import { TopBar } from "../../components";
import { colors, space, textPresets } from "../../theme";

export default function SettingsScreen() {
  return (
    <View style={styles.screen}>
      <TopBar kind="tab" title="Settings" />
      <View style={styles.body}>
        <Text style={styles.placeholder}>Group controls arrive here soon.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  placeholder: { ...textPresets.body, color: colors.text.secondary },
});
```

- [ ] **Step 6: Rewrite the root layout `mobile/app/_layout.tsx`**

Replace the `<Stack>` block's children (the three `Stack.Screen`s) so the stack mounts the tab group headerless and keeps `night`/`manage` as parked routes. Keep the `useFonts` gate, `SafeAreaProvider`, `StatusBar`, and `screenOptions` exactly as they are. The new return:

```tsx
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface.dark },
          headerTintColor: colors.text.primary,
          contentStyle: { backgroundColor: colors.surface.page },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="manage" options={{ title: "Manage members" }} />
        <Stack.Screen name="night" options={{ title: "Tonight" }} />
      </Stack>
    </SafeAreaProvider>
  );
```

- [ ] **Step 7: Delete the old turn-list route**

```bash
cd mobile && git rm app/index.tsx
```
Expected: `app/index.tsx` removed; `/` now resolves to `app/(tabs)/index.tsx`.

- [ ] **Step 8: Verify (automated)**

```bash
cd mobile && just check
```
Expected: lint + typecheck + tests all pass.

- [ ] **Step 9: Verify (manual smoke)**

```bash
cd mobile && just start
```
In Expo Go / web: confirm the app opens on Tonight; tapping each tab switches screen and the active tab is ember; the home top bar (logomark + wordmark + "Friday Film Club" + gear) and the `tab` titles render; the gear opens Settings. Then load `/night` and `/manage` (dev-menu deep link or web URL) and confirm both still render their existing screens.

- [ ] **Step 10: Commit**

```bash
git add mobile/app
git commit -m "feat(mobile): bottom tab navigator + four tab shells; park night/manage (#31)"
```

---

## Self-review notes

- **Spec coverage:** tab navigator (Task 3) ✓; four tab shells (Task 3) ✓; three top-bar kinds as shared chrome (Task 2) ✓; blur tab bar `night-950 @ 86%` + hairline + 11px labels + ember active (Tasks 1+3) ✓; old `night`/`manage` rehomed/routed (Task 3, parked) ✓; old `index` removed (Task 3) ✓; theme additions to avoid hardcoding (Task 1) ✓; `just check` passes (Task 3 verify) ✓.
- **Type consistency:** `TopBar` prop kinds (`home`/`tab`/`title`) match their use in the shells (home/tab only this issue); `surface.tabBar`, `textPresets.tabLabel`/`wordmark`/`tabTitle`/`barMeta` defined in Task 1 are consumed in Tasks 2–3; `BottomTabBarProps` imported from `expo-router/js-tabs` (verified re-export).
- **Atomicity note:** Task 3 is intentionally one task — the router cannot be valid with both `app/index.tsx` and `app/(tabs)/index.tsx` mapping to `/`, so the create+delete+restructure must land together.

## Non-goals

Real tab content, redesigning `night`/`manage`, Welcome/first-run, pushed detail screens, and scheduling — all later issues.
