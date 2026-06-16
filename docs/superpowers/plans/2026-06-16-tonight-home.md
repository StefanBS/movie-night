# Tonight home (whose-turn spotlight + On deck) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder Tonight tab with the real "no night planned" home — an ember whose-turn Spotlight hero plus an On deck list — wired to `GET /groups/{groupId}/turn`.

**Architecture:** The screen (`app/(tabs)/index.tsx`) fetches `fetchTurn` on mount (element 0 = picker, 1–3 = On deck) and renders loading / error / empty / loaded states with `TopBar` always mounted. Branchy display strings move into pure, unit-tested helpers in `lib/`. The ember glows use `react-native-svg`'s `RadialGradient` (already a dependency).

**Tech Stack:** Expo SDK 56, React Native 0.86, expo-router, react-native-svg 15, TypeScript; tests on `node:test` via `tsx`.

**User decisions (already made):**
- "Plan a night →" routes to the existing legacy `/night` route; "See full rotation →" and the ghost skip-turn button are rendered but inert (no-op) until #33 / #42.
- Both ember glows (hero card top wash + avatar halo) use `react-native-svg` `RadialGradient`; `expo-linear-gradient` is not used on this screen.
- Two no-op buttons rendered but inert is acceptable.

---

### Task 1: Pure display helpers

**Goal:** Add the unit-tested pure functions the screen needs: `formatShortDate` (date), `picksLabel` and `pickerMeta` (turn meta lines).

**Files:**
- Modify: `mobile/lib/date.ts`
- Modify: `mobile/lib/date.test.ts`
- Modify: `mobile/lib/turn.ts`
- Modify: `mobile/lib/turn.test.ts`

**Acceptance Criteria:**
- [ ] `formatShortDate("2026-05-30")` returns `"May 30"`.
- [ ] `picksLabel(1)` returns `"1 pick"`; `picksLabel(2)` returns `"2 picks"`; `picksLabel(0)` returns `"0 picks"`.
- [ ] `pickerMeta` returns `"First turn · hasn't picked yet"` when `servedCount === 0`, else `"<picksLabel> · last <formatShortDate>"`.
- [ ] `just test` passes (all new and existing tests).

**Verify:** `cd mobile && just test` → all tests pass, including the new cases.

**Steps:**

- [ ] **Step 1: Add the failing tests for `formatShortDate`** in `mobile/lib/date.test.ts`

Append to the existing file (it already imports from `./date`):

```typescript
import { formatShortDate } from "./date";

test("formats an ISO date as a short month + day", () => {
  assert.equal(formatShortDate("2026-05-30"), "May 30");
});

test("does not zero-pad the day", () => {
  assert.equal(formatShortDate("2026-01-05"), "Jan 5");
});

test("formats December correctly (last month index)", () => {
  assert.equal(formatShortDate("2025-12-31"), "Dec 31");
});
```

Update the existing top import line so both helpers come from `./date`:

```typescript
import { formatShortDate, todayLocalISO } from "./date";
```

(Remove the standalone `import { todayLocalISO } from "./date";` line if a duplicate would result — there must be exactly one import from `./date`.)

- [ ] **Step 2: Run the date tests to confirm they fail**

Run: `cd mobile && node --import tsx --test lib/date.test.ts`
Expected: FAIL — `formatShortDate is not a function` / not exported.

- [ ] **Step 3: Implement `formatShortDate`** in `mobile/lib/date.ts`

Append:

```typescript
const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// formatShortDate turns a YYYY-MM-DD string into a short "May 30" label. It
// splits the ISO string by hand (no Date parsing) so it stays timezone-
// independent, like todayLocalISO. The day is not zero-padded.
export function formatShortDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${SHORT_MONTHS[month - 1]} ${day}`;
}
```

- [ ] **Step 4: Run the date tests to confirm they pass**

Run: `cd mobile && node --import tsx --test lib/date.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the failing tests for `picksLabel` and `pickerMeta`** in `mobile/lib/turn.test.ts`

Append (the file already imports `type TurnMember` from `./turn`):

```typescript
import { picksLabel, pickerMeta } from "./turn";

test("picksLabel singularizes one pick", () => {
  assert.equal(picksLabel(1), "1 pick");
});

const picksCases: { n: number; want: string }[] = [
  { n: 0, want: "0 picks" },
  { n: 2, want: "2 picks" },
  { n: 12, want: "12 picks" },
];
for (const c of picksCases) {
  test(`picksLabel(${c.n}) is "${c.want}"`, () => {
    assert.equal(picksLabel(c.n), c.want);
  });
}

test("pickerMeta shows the first-turn copy when never picked", () => {
  const m: TurnMember = {
    id: "a", name: "Ada", role: "core", servedCount: 0, lastPickedOn: null,
  };
  assert.equal(pickerMeta(m), "First turn · hasn't picked yet");
});

test("pickerMeta shows picks count and last date once picked", () => {
  const m: TurnMember = {
    id: "b", name: "Bo", role: "core", servedCount: 2, lastPickedOn: "2026-05-30",
  };
  assert.equal(pickerMeta(m), "2 picks · last May 30");
});

test("pickerMeta falls back to first-turn copy if servedCount>0 but date missing", () => {
  const m: TurnMember = {
    id: "c", name: "Cy", role: "core", servedCount: 1, lastPickedOn: null,
  };
  assert.equal(pickerMeta(m), "First turn · hasn't picked yet");
});
```

- [ ] **Step 6: Run the turn tests to confirm they fail**

Run: `cd mobile && node --import tsx --test lib/turn.test.ts`
Expected: FAIL — `picksLabel` / `pickerMeta` not exported.

- [ ] **Step 7: Implement `picksLabel` and `pickerMeta`** in `mobile/lib/turn.ts`

Add this import at the top (after the existing `import { requestJson } from "./http";`):

```typescript
import { formatShortDate } from "./date";
```

Append at the end of the file:

```typescript
// picksLabel renders a served-count as a human label: "1 pick", "2 picks".
export function picksLabel(n: number): string {
  return `${n} pick${n === 1 ? "" : "s"}`;
}

// pickerMeta is the spotlight hero's mono meta line. A member who has never
// picked (servedCount 0, or no recorded date) shows the first-turn copy;
// otherwise their pick count and the short date of their last pick.
export function pickerMeta(member: TurnMember): string {
  if (member.servedCount === 0 || member.lastPickedOn === null) {
    return "First turn · hasn't picked yet";
  }
  return `${picksLabel(member.servedCount)} · last ${formatShortDate(member.lastPickedOn)}`;
}
```

- [ ] **Step 8: Run the full mobile test suite**

Run: `cd mobile && just test`
Expected: PASS — all existing and new tests green.

- [ ] **Step 9: Commit**

```bash
git add mobile/lib/date.ts mobile/lib/date.test.ts mobile/lib/turn.ts mobile/lib/turn.test.ts
git commit -m "feat(mobile): add formatShortDate, picksLabel, pickerMeta helpers"
```

---

### Task 2: Tonight home screen

**Goal:** Rebuild `app/(tabs)/index.tsx` to fetch the turn and render the Spotlight hero, On deck list, and the three home actions.

**Files:**
- Modify (full rewrite): `mobile/app/(tabs)/index.tsx`

**Acceptance Criteria:**
- [ ] On mount the screen calls `fetchTurn(API_URL, GROUP_ID)` with an `AbortController` signal and aborts on unmount.
- [ ] Loading shows an ember `ActivityIndicator`; a fetch failure shows `Couldn't load tonight: <message>`; an empty turn shows an empty-state line; otherwise the hero + On deck render.
- [ ] The hero shows the picker (element 0): `✦ NEXT UP` tag, a 64px glowing `Avatar` with a `RadialGradient` halo, the serif name, and `pickerMeta`. The card has a `RadialGradient` top ember wash.
- [ ] On deck lists turn elements 1–3 (when present) with ranks 2/3/4, a 32px `Avatar`, the name, and `picksLabel`.
- [ ] "Plan a night  →" navigates to `/night`; the skip-turn and "See full rotation  →" buttons render but are inert.
- [ ] `just check` (lint + typecheck + test) passes.

**Verify:** `cd mobile && just check` → passes. Then `just start`, open the app against the seeded "Friday Film Club" group, and confirm the hero shows the real next-up member, On deck shows the next three, and "Plan a night" opens the night screen.

**Steps:**

- [ ] **Step 1: Replace `mobile/app/(tabs)/index.tsx` entirely**

```tsx
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { Settings } from "lucide-react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

import {
  AppButton,
  Avatar,
  IconButton,
  SectionLabel,
  TopBar,
} from "../../components";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { fetchTurn, pickerMeta, picksLabel, type TurnMember } from "../../lib/turn";
import {
  borderWidth,
  colors,
  radius,
  shadow,
  space,
  textPresets,
} from "../../theme";

// Seeded group name (shared contract). A real source arrives with later work.
const GROUP_NAME = "Friday Film Club";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

const AVATAR = 64; // hero avatar diameter
const HALO = 96; // radial bloom box behind the hero avatar
const HALO_OFFSET = (AVATAR - HALO) / 2; // center the halo on the avatar

// SpotlightHero is the rationed-ember card — the one place ember means "whose
// turn it is". Both glows are react-native-svg RadialGradients: a top wash on
// the card and a circular halo behind the 64px avatar (the "bonfire halo").
function SpotlightHero({ member }: { member: TurnMember }) {
  return (
    <View style={styles.hero}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="heroWash" cx="50%" cy="0%" rx="80%" ry="60%">
            <Stop offset="0" stopColor={colors.accent.base} stopOpacity={0.26} />
            <Stop offset="1" stopColor={colors.accent.base} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroWash)" />
      </Svg>

      <Text style={styles.nextUp} allowFontScaling={false}>
        {"✦ Next up"}
      </Text>

      <View style={styles.avatarWrap}>
        <Svg width={HALO} height={HALO} style={styles.halo} pointerEvents="none">
          <Defs>
            <RadialGradient id="avatarHalo" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={colors.accent.base} stopOpacity={0.45} />
              <Stop offset="1" stopColor={colors.accent.base} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={HALO} height={HALO} fill="url(#avatarHalo)" />
        </Svg>
        <Avatar name={member.name} size={AVATAR} glow />
      </View>

      <Text style={styles.heroName} numberOfLines={1}>
        {member.name}
      </Text>
      <Text style={styles.heroMeta}>{pickerMeta(member)}</Text>
    </View>
  );
}

// OnDeck lists the next members after the picker (turn elements 1–3). Ranks are
// offset by 2 because the picker is rank 1 and lives in the hero above.
function OnDeck({ members }: { members: TurnMember[] }) {
  return (
    <>
      <SectionLabel>On deck</SectionLabel>
      <View>
        {members.map((m, i) => (
          <View
            key={m.id}
            style={[styles.deckRow, i < members.length - 1 && styles.deckDivider]}
          >
            <Text style={styles.deckRank} allowFontScaling={false}>
              {i + 2}
            </Text>
            <Avatar name={m.name} size={32} />
            <Text style={styles.deckName} numberOfLines={1}>
              {m.name}
            </Text>
            <Text style={styles.deckPicks} allowFontScaling={false}>
              {picksLabel(m.servedCount)}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

export default function TonightScreen() {
  const router = useRouter();
  const [order, setOrder] = useState<TurnMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setOrder(await fetchTurn(API_URL, GROUP_ID, controller.signal));
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(errorMessage(e, "failed to load tonight"));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  const gear = (
    <IconButton
      icon={<Settings size={22} color={colors.text.secondary} strokeWidth={2} />}
      onPress={() => router.navigate("/settings")}
      accessibilityLabel="Settings"
      variant="ghost"
    />
  );

  const picker = order[0] ?? null;
  const onDeck = order.slice(1, 4);
  const firstName = picker ? picker.name.split(" ")[0] : "";

  return (
    <View style={styles.screen}>
      <TopBar kind="home" group={GROUP_NAME} right={gear} />
      {loading ? (
        <ActivityIndicator
          style={styles.center}
          size="large"
          color={colors.accent.base}
        />
      ) : error !== null ? (
        <Text style={[styles.center, styles.error]}>
          {`Couldn't load tonight: ${error}`}
        </Text>
      ) : picker === null ? (
        <View style={styles.body}>
          <Text style={styles.empty}>{"No one's in the rotation yet."}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <SpotlightHero member={picker} />
          <View style={styles.planRow}>
            <AppButton
              title="Plan a night  →"
              fullWidth
              onPress={() => router.navigate("/night")}
            />
          </View>
          <View style={styles.skipRow}>
            <AppButton
              title={`${firstName} can't make it — skip turn`}
              variant="ghost"
              onPress={() => {}}
            />
          </View>
          {onDeck.length > 0 ? <OnDeck members={onDeck} /> : null}
          <View style={styles.rotationRow}>
            <AppButton
              title="See full rotation  →"
              variant="ghost"
              onPress={() => {}}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  center: { marginTop: space[8], textAlign: "center" },
  error: { ...textPresets.body, color: colors.text.danger },
  empty: { ...textPresets.body, color: colors.text.secondary, textAlign: "center" },
  content: {
    paddingHorizontal: space[5],
    paddingTop: space[4],
    paddingBottom: space[10],
  },
  // The ember spotlight card — surface.dark + the bonfire halo shadow.
  hero: {
    borderRadius: radius.xl,
    paddingTop: space[6],
    paddingBottom: space[5],
    paddingHorizontal: space[5],
    backgroundColor: colors.surface.dark,
    alignItems: "center",
    overflow: "hidden",
    ...shadow.spotlight,
  },
  nextUp: { ...textPresets.tag, color: colors.accent.strong },
  avatarWrap: {
    marginTop: space[4],
    width: AVATAR,
    height: AVATAR,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: { position: "absolute", top: HALO_OFFSET, left: HALO_OFFSET },
  heroName: {
    ...textPresets.screenTitle,
    color: colors.text.primary,
    marginTop: space[3],
    textAlign: "center",
  },
  heroMeta: {
    fontFamily: textPresets.tag.fontFamily,
    fontSize: textPresets.tag.fontSize,
    color: colors.text.tertiary,
    marginTop: space[2],
  },
  deckRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
  },
  deckDivider: {
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  deckRank: {
    ...textPresets.tag,
    textTransform: "none",
    color: colors.text.tertiary,
    width: 16,
  },
  deckName: { ...textPresets.rowName, color: colors.text.primary, flex: 1 },
  deckPicks: {
    fontFamily: textPresets.tag.fontFamily,
    fontSize: textPresets.tag.fontSize,
    color: colors.text.tertiary,
  },
});
```

- [ ] **Step 2: Confirm the `react-native-svg` v56 RadialGradient API**

Per `mobile/AGENTS.md`, before relying on the SVG props above, open
<https://docs.expo.dev/versions/v56.0.0/sdk/svg/> (or the react-native-svg 15
README) and confirm `RadialGradient` accepts `cx`/`cy`/`rx`/`ry` percentage
strings and that `Stop` takes `offset`/`stopColor`/`stopOpacity`. These are the
standard react-native-svg 15 props; adjust only if the versioned docs differ.

- [ ] **Step 3: Run the gate (lint + typecheck + test)**

Run: `cd mobile && just check`
Expected: PASS — no lint errors, no type errors, all tests green.

- [ ] **Step 4: Manual smoke test**

Run: `cd mobile && just start`, then open the app (simulator or QR). With the
backend running and seeded, confirm:
- The hero shows the real next-up member with the ember halo and the correct
  meta line ("First turn · hasn't picked yet" or "N picks · last <date>").
- On deck lists the next three with ranks 2–4 and picks counts.
- "Plan a night →" opens the night screen; the gear opens Settings.
- The skip-turn and "See full rotation →" buttons are visible but do nothing.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/(tabs)/index.tsx
git commit -m "feat(mobile): Tonight home — whose-turn spotlight + On deck (#32)"
```

---

## Self-Review

**Spec coverage:**
- `home` top bar (logomark + wordmark + group + gear) → already provided by `TopBar kind="home"` + gear `IconButton` in Task 2 (unchanged from current screen). ✓
- Spotlight hero (mono NEXT UP → 64px avatar + ember glow → serif name → mono meta) → Task 2 `SpotlightHero` + Task 1 `pickerMeta`. ✓
- Primary "Plan a night →" + ghost skip-turn → Task 2 actions (routes to `/night`; skip is inert per decision). ✓
- On deck (next 3: rank + sm avatar + picks count) + ghost "See full rotation →" → Task 2 `OnDeck` + Task 1 `picksLabel`; rotation link inert per decision. ✓
- Wire to `GET /groups/{id}/turn`, renders real turn data → Task 2 `fetchTurn`. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `TurnMember` used as defined in `lib/turn.ts`; `picksLabel(n: number)`, `pickerMeta(member: TurnMember)`, `formatShortDate(iso: string)` signatures match between Task 1 definitions and Task 2 usage. ✓
