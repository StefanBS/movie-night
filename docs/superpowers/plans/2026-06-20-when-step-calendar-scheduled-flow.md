# Plan a night on any date — When step, Calendar & Scheduled flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepend a "When" step (Tonight chip + bespoke month Calendar) to the mobile night wizard and branch the flow on the chosen date — tonight runs to Recorded (unchanged), a future date schedules the night (picker locked, film later) and ends on a new Scheduled ✓ screen.

**Architecture:** Pure date/grid logic lands in `lib/` (table-driven, no mocks); a presentational `components/Calendar.tsx` renders it; the five wizard step views are extracted from `app/night/new.tsx` into `components/night/`, leaving the screen a lean stateful container that adds the When entry point and the tonight-vs-scheduled branch. No backend changes — `createNight` already accepts a future `scheduledFor`.

**Tech Stack:** Expo SDK 56 / React Native, TypeScript, expo-router, `lucide-react-native`, Node `node:test` via `tsx`. Theme tokens in `mobile/theme/`.

**User decisions (already made):**
- Combine #44 and #45 into one feature ("plan a night on any date").
- Quick chips: "Tonight" only (no dynamic weekend dates).
- Build our own Calendar (no OS picker, no `react-native-calendars`); no new dependency.
- Extract all five wizard steps into `components/night/` now (not inline).
- Resume into the Scheduled screen for an already-scheduled future night.

Spec: `docs/superpowers/specs/2026-06-20-when-step-calendar-scheduled-flow-design.md`.

---

## File structure

| File | Responsibility |
|------|----------------|
| `mobile/lib/calendar.ts` (new) | Pure: `monthGrid`, `shiftMonth`, `nightDates`, `dayState`. |
| `mobile/lib/calendar.test.ts` (new) | Table-driven tests for the above. |
| `mobile/lib/nightFlow.ts` (edit) | Extend `Step`; add the `scheduled` resume branch. |
| `mobile/lib/nightFlow.test.ts` (edit) | Cases for the new signature + branch. |
| `mobile/components/Calendar.tsx` (new) | Presentational month picker. |
| `mobile/components/index.ts` (edit) | Export `Calendar`. |
| `mobile/components/night/{Stepper,WizardFooter,WhoStep,PickStep,RecordedStep}.tsx` (new) | Steps/chrome moved out of `new.tsx`. |
| `mobile/components/night/{WhenStep,ScheduledStep}.tsx` (new) | New steps. |
| `mobile/components/night/index.ts` (new) | Barrel the container imports. |
| `mobile/app/night/new.tsx` (edit) | Lean container: data, handlers, render switch. |

All paths below are relative to the repo root. `components/night/X.tsx` sits two
directories under `mobile/`, the same depth as `app/night/new.tsx`, so
`../../theme` and `../../lib/...` imports are identical after a move — **only** the
component-barrel import changes (`../../components` → `../`).

---

### Task 1: `lib/calendar.ts` — calendar grid & day-state logic

**Goal:** The pure functions the Calendar needs — month layout, month navigation, the night-dates selector, and per-day state — fully unit-tested.

**Files:**
- Create: `mobile/lib/calendar.ts`
- Test: `mobile/lib/calendar.test.ts`

**Acceptance Criteria:**
- [ ] `monthGrid(year, month)` returns leading `null` blanks (= weekday of the 1st) then one `{ iso, day }` cell per day, ISO zero-padded.
- [ ] `shiftMonth` rolls ±1 across the Dec↔Jan year boundary.
- [ ] `nightDates` dedupes `scheduledFor` into a `Set`.
- [ ] `dayState` reports selected/today/hasNight/past, suppressing `hasNight` under selection and treating `daysUntil === 0` as **not** past.
- [ ] `node --import tsx --test lib/calendar.test.ts` passes.

**Verify:** `cd mobile && node --import tsx --test lib/calendar.test.ts` → all tests pass, 0 fail.

**Steps:**

- [ ] **Step 1: Write the failing test** — create `mobile/lib/calendar.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { dayState, monthGrid, nightDates, shiftMonth } from "./calendar";
import type { Night } from "./nights";

// monthGrid — built from local-time Date components, so timezone-independent.
test("monthGrid: a month starting on Sunday has no leading blanks", () => {
  // 2026-02-01 is a Sunday.
  const cells = monthGrid(2026, 2);
  assert.equal(cells[0]?.iso, "2026-02-01");
  assert.equal(cells.length, 28); // 0 blanks + 28 days (non-leap)
});

test("monthGrid: leading blanks equal the weekday of the 1st", () => {
  // 2026-06-01 is a Monday → 1 leading blank.
  const cells = monthGrid(2026, 6);
  assert.equal(cells[0], null);
  assert.equal(cells[1]?.iso, "2026-06-01");
  assert.equal(cells.length, 1 + 30);
});

test("monthGrid: a month starting on Saturday has six leading blanks", () => {
  // 2026-08-01 is a Saturday → 6 blanks.
  const cells = monthGrid(2026, 8);
  assert.deepEqual(cells.slice(0, 6), [null, null, null, null, null, null]);
  assert.equal(cells[6]?.iso, "2026-08-01");
});

test("monthGrid: February 2024 is a leap month (29 days)", () => {
  const days = monthGrid(2024, 2).filter((c) => c !== null);
  assert.equal(days.length, 29);
  assert.equal(days[days.length - 1]?.iso, "2024-02-29");
});

test("monthGrid: zero-pads month and day in the ISO", () => {
  const cells = monthGrid(2026, 6).filter((c) => c !== null);
  assert.equal(cells[0]?.iso, "2026-06-01");
  assert.equal(cells[8]?.iso, "2026-06-09");
});

// shiftMonth
test("shiftMonth: +1 within the year", () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 6 }, 1), { year: 2026, month: 7 });
});
test("shiftMonth: -1 within the year", () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 6 }, -1), { year: 2026, month: 5 });
});
test("shiftMonth: December +1 rolls to next January", () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
});
test("shiftMonth: January -1 rolls to previous December", () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
});

// nightDates
const night = (scheduledFor: string): Night => ({
  id: scheduledFor,
  scheduledFor,
  pickerId: null,
  movie: null,
  attendees: [],
});
test("nightDates: empty list → empty set", () => {
  assert.equal(nightDates([]).size, 0);
});
test("nightDates: collapses duplicate dates and keeps distinct ones", () => {
  const set = nightDates([night("2026-06-19"), night("2026-06-19"), night("2026-06-26")]);
  assert.equal(set.size, 2);
  assert.ok(set.has("2026-06-19"));
  assert.ok(set.has("2026-06-26"));
});

// dayState
const today = "2026-06-20";
const dates = new Set(["2026-06-26"]);
test("dayState: selected", () => {
  const s = dayState("2026-06-22", { selected: "2026-06-22", today, nightDates: dates });
  assert.equal(s.selected, true);
});
test("dayState: today (unselected) is today and not past", () => {
  const s = dayState(today, { selected: "2026-06-22", today, nightDates: dates });
  assert.deepEqual(s, { selected: false, today: true, hasNight: false, past: false });
});
test("dayState: a night date shows hasNight", () => {
  const s = dayState("2026-06-26", { selected: "2026-06-22", today, nightDates: dates });
  assert.equal(s.hasNight, true);
});
test("dayState: hasNight is suppressed when the night date is also selected", () => {
  const s = dayState("2026-06-26", { selected: "2026-06-26", today, nightDates: dates });
  assert.equal(s.selected, true);
  assert.equal(s.hasNight, false);
});
test("dayState: yesterday is past, today is not", () => {
  assert.equal(dayState("2026-06-19", { selected: "", today, nightDates: dates }).past, true);
  assert.equal(dayState("2026-06-20", { selected: "", today, nightDates: dates }).past, false);
  assert.equal(dayState("2026-06-21", { selected: "", today, nightDates: dates }).past, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mobile && node --import tsx --test lib/calendar.test.ts`
Expected: FAIL — `Cannot find module './calendar'`.

- [ ] **Step 3: Write the implementation** — create `mobile/lib/calendar.ts`:

```ts
import { daysUntil } from "./date";
import type { Night } from "./nights";

// A calendar cell: a day, or null for the blank leading slots before the 1st.
export type DayCell = { iso: string; day: number } | null;

// monthGrid lays out one month (month: 1–12) as left-to-right, top-to-bottom
// cells: `firstWeekday` leading blanks (Sun=0) then one cell per day, each
// carrying its YYYY-MM-DD. Numeric Date args construct local midnight (like
// lib/date.ts), so the column math stays timezone-independent.
export function monthGrid(year: number, month: number): DayCell[] {
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=Sun … 6=Sat
  const daysInMonth = new Date(year, month, 0).getDate(); // day 0 of next month
  const pad = (n: number) => String(n).padStart(2, "0");
  const cells: DayCell[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: `${year}-${pad(month)}-${pad(d)}`, day: d });
  }
  return cells;
}

// YearMonth is the calendar's displayed month, kept as plain numbers (month 1–12)
// rather than a Date so it stays timezone-clean and trivially serializable.
export type YearMonth = { year: number; month: number };

// shiftMonth rolls the displayed month by ±1, carrying the year across the
// Dec↔Jan boundary.
export function shiftMonth({ year, month }: YearMonth, dir: -1 | 1): YearMonth {
  const m = month + dir;
  if (m < 1) return { year: year - 1, month: 12 };
  if (m > 12) return { year: year + 1, month: 1 };
  return { year, month: m };
}

// nightDates is the issue's named selector: the set of dates that already have a
// night, for the calendar dots. (A Night maps to exactly one scheduledFor.)
export function nightDates(nights: Night[]): Set<string> {
  return new Set(nights.map((n) => n.scheduledFor));
}

export type DayState = {
  selected: boolean;
  today: boolean;
  hasNight: boolean;
  past: boolean;
};

// dayState classifies one day for the renderer: the has-night dot is hidden under
// the selection, and `past` is purely date-relative (past days stay selectable).
export function dayState(
  iso: string,
  opts: { selected: string; today: string; nightDates: Set<string> },
): DayState {
  const selected = iso === opts.selected;
  return {
    selected,
    today: iso === opts.today,
    hasNight: opts.nightDates.has(iso) && !selected,
    past: daysUntil(iso, opts.today) < 0,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd mobile && node --import tsx --test lib/calendar.test.ts`
Expected: PASS — all tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd mobile && git add lib/calendar.ts lib/calendar.test.ts
git commit -m "feat(mobile): calendar grid + day-state logic (#44)"
```

---

### Task 2: `lib/nightFlow.ts` — extend Step with the scheduled branch

**Goal:** Add the `when`/`scheduled` step values and resume a future, picker-locked night onto the Scheduled screen, leaving today's behaviour otherwise intact.

**Files:**
- Modify: `mobile/lib/nightFlow.ts`
- Test: `mobile/lib/nightFlow.test.ts`

**Acceptance Criteria:**
- [ ] `Step` is `"when" | "who" | "pick" | "recorded" | "scheduled"`.
- [ ] `deriveInitialStep(night, today?)`: movie set → `recorded`; future + picker → `scheduled`; otherwise `who` (tonight-with-picker still `who`; past-future still `who`).
- [ ] `today` is injectable and defaults to `todayLocalISO()`.
- [ ] `node --import tsx --test lib/nightFlow.test.ts` passes.

**Verify:** `cd mobile && node --import tsx --test lib/nightFlow.test.ts` → all tests pass, 0 fail.

**Steps:**

- [ ] **Step 1: Update the tests** — replace `mobile/lib/nightFlow.test.ts` with:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveInitialStep, isResumable, type Step } from "./nightFlow";
import type { Night } from "./nights";

const TODAY = "2026-06-20";

function night(over: Partial<Night>): Night {
  return {
    id: "n1",
    scheduledFor: TODAY,
    pickerId: null,
    movie: null,
    attendees: [],
    ...over,
  };
}

const movie = { tmdbId: 1, title: "X", releaseYear: 2020, posterUrl: null };

const cases: [string, Night, Step][] = [
  ["movie attached → recorded", night({ movie }), "recorded"],
  ["future + picker → scheduled", night({ scheduledFor: "2026-06-27", pickerId: "p1" }), "scheduled"],
  ["future + no picker → who", night({ scheduledFor: "2026-06-27" }), "who"],
  ["tonight + picker (no movie) → who", night({ pickerId: "p1" }), "who"],
  ["tonight + no picker → who", night({}), "who"],
  ["past + picker (no movie) → who", night({ scheduledFor: "2026-06-10", pickerId: "p1" }), "who"],
  ["movie present even with no picker → recorded", night({ movie, pickerId: null }), "recorded"],
];

for (const [name, n, expected] of cases) {
  test(`deriveInitialStep: ${name}`, () => {
    assert.equal(deriveInitialStep(n, TODAY), expected);
  });
}

test("isResumable: unchanged — open until a movie attaches", () => {
  assert.equal(isResumable(night({})), true);
  assert.equal(isResumable(night({ movie })), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mobile && node --import tsx --test lib/nightFlow.test.ts`
Expected: FAIL — `scheduled` case fails (current code returns `who`) and the `Step`/signature changes are missing.

- [ ] **Step 3: Update `mobile/lib/nightFlow.ts`** — change the imports, the `Step` type, and `deriveInitialStep`; leave `isResumable` untouched. New file head:

```ts
import { daysUntil, todayLocalISO } from "./date";
import type { Night } from "./nights";

// The night wizard's steps. "when" is the entry (date picker); "scheduled" is the
// terminal for a future night (picker locked, film chosen on the night).
export type Step = "when" | "who" | "pick" | "recorded" | "scheduled";

// deriveInitialStep maps a resumed night to the step the wizard should open on. A
// future night whose picker is locked (movie still null) resumes on the Scheduled
// confirmation; everything else keeps today's behaviour — recorded when a movie is
// attached, otherwise the non-destructive "who" (the picker is re-derived on
// advancing; "pick" stays a forward-only transition, never a resume target).
// `today` is injectable for deterministic tests (mirrors lib/date.ts).
export function deriveInitialStep(night: Night, today: string = todayLocalISO()): Step {
  if (night.movie !== null) return "recorded";
  if (night.pickerId !== null && daysUntil(night.scheduledFor, today) > 0) {
    return "scheduled";
  }
  return "who";
}
```

Keep the existing `isResumable` function and its comment exactly as they are.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd mobile && node --import tsx --test lib/nightFlow.test.ts`
Expected: PASS — all cases, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd mobile && git add lib/nightFlow.ts lib/nightFlow.test.ts
git commit -m "feat(mobile): nightFlow scheduled resume branch (#45)"
```

---

### Task 3: `components/Calendar.tsx` — the month picker

**Goal:** A presentational month calendar that renders `monthGrid`/`dayState` output with Spotlight styling and reports taps; no data, no business logic.

**Files:**
- Create: `mobile/components/Calendar.tsx`
- Modify: `mobile/components/index.ts` (add the export)

**Acceptance Criteria:**
- [ ] Props `{ value, today, month, nightDates, onPick, onMonth }`; renders a serif `Month YYYY` header with two `IconButton` chevrons, a mono weekday row, and a 7-column day grid.
- [ ] Day visuals follow `dayState`: selected → solid ember fill + onAccent text + ember shadow; today (unselected) → ember ring; past (unselected) → dimmed; hasNight → ember dot.
- [ ] Past days remain tappable; tapping any day calls `onPick(iso)`; chevrons call `onMonth(±1)`.
- [ ] Only `theme/` tokens used (no hardcoded colours/type).

**Verify:** `cd mobile && just typecheck && just lint` → 0 errors. (Visual states confirmed when the app runs in Task 5.)

**Steps:**

- [ ] **Step 1: Create `mobile/components/Calendar.tsx`:**

```tsx
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { IconButton } from "./IconButton";
import { dayState, monthGrid, type YearMonth } from "../lib/calendar";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  pressedOpacity,
  radius,
  shadow,
  space,
  textPresets,
  trackPx,
} from "../theme";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

// Calendar is the bonfire-styled month date picker. It is purely presentational:
// it computes its cells from `month` via monthGrid, classifies each day with
// dayState, and reports taps. The owner holds `value` (selected ISO) and `month`.
export function Calendar({
  value,
  today,
  month,
  nightDates,
  onPick,
  onMonth,
}: {
  value: string;
  today: string;
  month: YearMonth;
  nightDates: Set<string>;
  onPick: (iso: string) => void;
  onMonth: (dir: -1 | 1) => void;
}) {
  const cells = monthGrid(month.year, month.month);
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.monthName} allowFontScaling={false}>
          {`${MONTH_NAMES[month.month - 1]} ${month.year}`}
        </Text>
        <View style={styles.chevrons}>
          <IconButton
            icon={<ChevronLeft size={17} color={colors.text.secondary} />}
            onPress={() => onMonth(-1)}
            accessibilityLabel="Previous month"
          />
          <IconButton
            icon={<ChevronRight size={17} color={colors.text.secondary} />}
            onPress={() => onMonth(1)}
            accessibilityLabel="Next month"
          />
        </View>
      </View>

      <View style={styles.weekdays}>
        {WEEKDAY_INITIALS.map((w, i) => (
          <Text key={i} style={styles.weekday} allowFontScaling={false}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, i) => {
          if (cell === null) {
            return <View key={`blank-${i}`} style={styles.cell} />;
          }
          const state = dayState(cell.iso, { selected: value, today, nightDates });
          return (
            <Pressable
              key={cell.iso}
              onPress={() => onPick(cell.iso)}
              accessibilityRole="button"
              accessibilityLabel={cell.iso}
              style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
            >
              <View
                style={[
                  styles.circle,
                  state.today && !state.selected && styles.todayRing,
                  state.selected && styles.selectedCircle,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    state.past && !state.selected && styles.pastText,
                    state.selected && styles.selectedText,
                  ]}
                  allowFontScaling={false}
                >
                  {cell.day}
                </Text>
              </View>
              <View style={[styles.dot, state.hasNight && styles.dotOn]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const COLUMN = "14.2857%"; // 100% / 7

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space[3],
  },
  monthName: { ...textPresets.barTitle, color: colors.text.primary },
  chevrons: { flexDirection: "row", gap: space[2] },
  weekdays: { flexDirection: "row", marginBottom: space[1] },
  weekday: {
    width: COLUMN,
    textAlign: "center",
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: COLUMN, alignItems: "center", paddingVertical: space[1] },
  pressed: { opacity: pressedOpacity },
  circle: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  todayRing: { borderWidth: borderWidth.regular, borderColor: colors.accent.strong },
  selectedCircle: { backgroundColor: colors.accent.base, ...shadow.spotlight },
  dayText: { fontFamily: fontFamily.sans, fontSize: fontSize.base, color: colors.text.primary },
  pastText: { color: colors.text.tertiary },
  selectedText: { fontFamily: fontFamily.sansBold, color: colors.text.onAccent },
  dot: {
    width: 4,
    height: 4,
    borderRadius: radius.full,
    marginTop: space[1],
    backgroundColor: "transparent",
  },
  dotOn: { backgroundColor: colors.accent.strong },
});
```

- [ ] **Step 2: Export it** — add to `mobile/components/index.ts` (after the `TopBar`/`TabScrollView` lines):

```ts
export { Calendar } from "./Calendar";
```

- [ ] **Step 3: Verify typecheck + lint**

Run: `cd mobile && just typecheck && just lint`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd mobile && git add components/Calendar.tsx components/index.ts
git commit -m "feat(mobile): Calendar month picker component (#44)"
```

---

### Task 4: Extract the wizard steps into `components/night/`

**Goal:** Move the three existing step views plus the shared `Stepper`/`WizardFooter` out of `app/night/new.tsx` into `components/night/`, behaviour unchanged (still tonight-only), so the container is lean before the new steps land.

**Files:**
- Create: `mobile/components/night/Stepper.tsx`, `WizardFooter.tsx`, `WhoStep.tsx`, `PickStep.tsx`, `RecordedStep.tsx`, `index.ts`
- Modify: `mobile/app/night/new.tsx`

**Acceptance Criteria:**
- [ ] `WhoStep`/`PickStep`/`RecordedStep`/`Stepper`/`WizardFooter` live in `components/night/`, each with its own `StyleSheet`.
- [ ] `app/night/new.tsx` imports the three steps from `../../components/night` and no longer defines them or the shared chrome.
- [ ] The tonight flow still works end-to-end; `just check` passes.

**Verify:** `cd mobile && just check` → lint + typecheck + tests all pass.

**Move rules (apply to every file below):** copy the function body **verbatim** from
the current `app/night/new.tsx`; do **not** rewrite it. The only edit inside a moved
body is the component-barrel import path (`"../../components"` → `"../"`). Each file
gets a local `StyleSheet.create` holding exactly the listed style keys, copied
verbatim from the big `styles` block at the bottom of the current `new.tsx`
(duplicate shared keys across files as needed).

**Steps:**

- [ ] **Step 1: `components/night/Stepper.tsx`** — move the `STEP_LABELS` const + `Stepper` function (current `new.tsx` lines 57–98).

Header:
```tsx
import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, fontFamily, radius, space, textPresets } from "../../theme";
```
Then the verbatim `STEP_LABELS` + `Stepper`. Local `StyleSheet` keys: `stepper`, `stepItem`, `stepBar`, `stepBarDone`, `stepDot`, `stepDotActive`, `stepDotText`, `stepDotTextActive`, `stepLabel`, `stepLabelActive`. Export `Stepper`.

- [ ] **Step 2: `components/night/WizardFooter.tsx`** — move the `WizardFooter` function (current lines 100–109).

Header:
```tsx
import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { borderWidth, colors, space } from "../../theme";
```
Verbatim `WizardFooter`. Local `StyleSheet` key: `footer`. Export `WizardFooter`.

- [ ] **Step 3: `components/night/WhoStep.tsx`** — move the `firstNameOf` helper (lines 59–61) and the `WhoStep` function (lines 111–185).

Header:
```tsx
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Avatar, Badge, SectionLabel } from "../";
import { Stepper } from "./Stepper";
import { WizardFooter } from "./WizardFooter";
import { formatShortDate } from "../../lib/date";
import type { Member } from "../../lib/members";
import type { Night } from "../../lib/nights";
import type { TurnMember } from "../../lib/turn";
import { borderWidth, colors, pressedOpacity, radius, shadow, space, textPresets } from "../../theme";
```
Verbatim `WhoStep` (and the local `firstNameOf`). Local `StyleSheet` keys: `flex`, `content`, `heading`, `hint`, `attendRow`, `attendDivider`, `pickerRow`, `dimmed`, `rowPressed`, `rowText`, `name`, `getsPick`, `outTag`, `tag`. Export `WhoStep`.

- [ ] **Step 4: `components/night/PickStep.tsx`** — move the `PickStep` function (lines 187–306).

Header:
```tsx
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Avatar, Badge, Input, Poster, SectionLabel } from "../";
import { Stepper } from "./Stepper";
import type { Member } from "../../lib/members";
import type { Movie } from "../../lib/movies";
import type { Night } from "../../lib/nights";
import { borderWidth, colors, fontFamily, fontSize, pressedOpacity, space, textPresets } from "../../theme";
```
Reuse the local `firstNameOf` — add a copy of `function firstNameOf(name: string) { return name.split(" ")[0]; }` to this file (PickStep uses it). Local `StyleSheet` keys: `flex`, `content`, `hint`, `error`, `rowText`, `name`, `tag`, `rowPressed`, `pickerCard`, `pickingTag`, `pickerName`, `changeRow`, `chooseRow`, `searchSpinner`, `resultRow`, `resultTitle`, `resultYear`. Export `PickStep`. (Note: `colors` is needed for the `ActivityIndicator` colour.)

- [ ] **Step 5: `components/night/RecordedStep.tsx`** — move the `RecordedStep` function (lines 308–367).

Header:
```tsx
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Avatar, Badge, Poster, SectionLabel } from "../";
import { WizardFooter } from "./WizardFooter";
import { formatShortDate } from "../../lib/date";
import type { Member } from "../../lib/members";
import type { Night } from "../../lib/nights";
import { fontFamily, fontSize, colors, space, trackPx } from "../../theme";
```
Verbatim `RecordedStep`. Local `StyleSheet` keys: `flex`, `recordedContent`, `recordedBadge`, `recordedTitle`, `recordedYear`, `pickedBy`, `pickedByText`, `pickedByName`, `watchedCluster`, `watchedAvatar`, `watchedOverlap`, `changeMovieRow`. Export `RecordedStep`.

- [ ] **Step 6: `components/night/index.ts`** — barrel:

```ts
export { WhoStep } from "./WhoStep";
export { PickStep } from "./PickStep";
export { RecordedStep } from "./RecordedStep";
```
(`Stepper`/`WizardFooter` stay internal to the step files; the container does not import them.)

- [ ] **Step 7: Slim down `app/night/new.tsx`** — delete the moved code and import the steps:
  - Remove the `Fragment`/`useSafeAreaInsets` imports if now unused by the container (the container keeps `useCallback`/`useEffect`/`useMemo`/`useState` and `ActivityIndicator`/`Pressable?`… keep only what remains used — typecheck will flag leftovers).
  - Delete `STEP_LABELS`, `firstNameOf`, `Stepper`, `WizardFooter`, `WhoStep`, `PickStep`, `RecordedStep` definitions (current lines 57–367).
  - Add: `import { WhoStep, PickStep, RecordedStep } from "../../components/night";`
  - In the bottom `StyleSheet`, keep only the container-level keys still referenced by the container's own render (`screen`, `center`, `error`, `banner`, `start`, `hint`, `content`? — keep `content`/`flex` only if the container still uses them; it does not after extraction, so delete unused keys). After editing, **let `just lint`/`just typecheck` tell you which style keys and imports are now unused** and remove them.

- [ ] **Step 8: Verify the tonight flow still builds and tests pass**

Run: `cd mobile && just check`
Expected: lint + typecheck + tests all pass (the existing `nightFlow`/`date` tests still green; no behaviour change).

- [ ] **Step 9: Commit**

```bash
cd mobile && git add app/night/new.tsx components/night/
git commit -m "refactor(mobile): extract night wizard steps to components/night/"
```

---

### Task 5: When step + container wiring (the live entry point)

**Goal:** Replace the "Start tonight's night" intro with the When step (Tonight chip + Calendar + footer); fetch night dates for the dots; create the night for the chosen date and enter the existing flow. Tonight path works end-to-end.

**Files:**
- Create: `mobile/components/night/WhenStep.tsx`
- Modify: `mobile/components/night/Stepper.tsx` (4 labels), `WhoStep.tsx` + `PickStep.tsx` (bump `current`), `components/night/index.ts` (export `WhenStep`), `app/night/new.tsx` (wiring)

**Acceptance Criteria:**
- [ ] Opening Plan a night lands on When: a "Tonight" chip (solid ember when today is selected) + the Calendar inside a card + a sticky footer showing `PLANNING`/`TONIGHT` + `relativeLabel` and "Next: who's coming →".
- [ ] Calendar dots appear on dates returned by `listNights`; a `listNights` failure degrades to no dots (screen still loads).
- [ ] "Next: who's coming →" creates the night for the selected date and advances to Who; picking Tonight still runs Who → Pick → Recorded.
- [ ] Stepper shows four steps (When · Here · Pick · Done); When is step 0.

**Verify:** `cd mobile && just check` passes; then run the app (`just start`) against the seeded group — When renders, a seeded night's date shows a dot, "Tonight" → Next → Who works.

**Steps:**

- [ ] **Step 1: Create `mobile/components/night/WhenStep.tsx`:**

```tsx
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Calendar } from "../";
import { Stepper } from "./Stepper";
import { WizardFooter } from "./WizardFooter";
import { shiftMonth, type YearMonth } from "../../lib/calendar";
import { daysUntil, relativeLabel } from "../../lib/date";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  pressedOpacity,
  radius,
  space,
  textPresets,
} from "../../theme";

// WhenStep is the wizard's first step: a "Tonight" chip + the Calendar, with a
// sticky footer that names the plan (TONIGHT/PLANNING) and its relative date. It
// owns its own selection/month — it is just a date picker that reports the chosen
// date on "Next".
export function WhenStep({
  today,
  nightDates,
  busy,
  onNext,
}: {
  today: string;
  nightDates: Set<string>;
  busy: string | null;
  onNext: (iso: string) => void;
}) {
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState<YearMonth>(() => {
    const [year, m] = today.split("-").map(Number);
    return { year, month: m };
  });
  const isToday = selected === today;
  const future = daysUntil(selected, today) > 0;

  const pickToday = () => {
    setSelected(today);
    const [year, m] = today.split("-").map(Number);
    setMonth({ year, month: m });
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <Stepper current={0} />
        <Text style={styles.heading}>{"When's the night?"}</Text>
        <Text style={styles.hint}>
          {"Tonight, or pick any date to plan ahead. We'll remind everyone."}
        </Text>

        <View style={styles.chips}>
          <Pressable
            onPress={pickToday}
            style={({ pressed }) => [
              styles.chip,
              isToday ? styles.chipOn : styles.chipOff,
              pressed && styles.chipPressed,
            ]}
          >
            <Text
              style={[styles.chipText, isToday && styles.chipTextOn]}
              allowFontScaling={false}
            >
              Tonight
            </Text>
          </Pressable>
        </View>

        <View style={styles.calendarCard}>
          <Calendar
            value={selected}
            today={today}
            month={month}
            nightDates={nightDates}
            onPick={setSelected}
            onMonth={(dir) => setMonth((m) => shiftMonth(m, dir))}
          />
        </View>
      </ScrollView>

      <WizardFooter>
        <View style={styles.footerMeta}>
          <Text style={styles.planTag} allowFontScaling={false}>
            {future ? "PLANNING" : "TONIGHT"}
          </Text>
          <Text style={styles.relLabel} allowFontScaling={false}>
            {relativeLabel(selected, today)}
          </Text>
        </View>
        <AppButton
          title="Next: who's coming  →"
          fullWidth
          disabled={busy !== null}
          onPress={() => onNext(selected)}
        />
      </WizardFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: space[6] },
  heading: { ...textPresets.screenTitle, color: colors.text.primary, marginTop: space[4] },
  hint: { ...textPresets.meta, color: colors.text.secondary, marginTop: space[2] },
  chips: { flexDirection: "row", gap: space[2], marginTop: space[4] },
  chip: { paddingVertical: space[2], paddingHorizontal: space[4], borderRadius: radius.full },
  chipOn: { backgroundColor: colors.accent.base },
  chipOff: {
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
  },
  chipPressed: { opacity: pressedOpacity },
  chipText: { fontFamily: fontFamily.sansSemibold, fontSize: fontSize.sm, color: colors.text.secondary },
  chipTextOn: { color: colors.text.onAccent },
  calendarCard: {
    marginTop: space[4],
    padding: space[4],
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
    borderRadius: radius.lg,
  },
  footerMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planTag: { ...textPresets.tag, color: colors.text.tertiary },
  relLabel: { fontFamily: fontFamily.sansSemibold, fontSize: fontSize.sm, color: colors.accent.strong },
});
```

- [ ] **Step 2: Make the Stepper four steps** — in `components/night/Stepper.tsx` change:

```ts
const STEP_LABELS = ["When", "Here", "Pick", "Done"] as const;
```

- [ ] **Step 3: Bump the existing steps' indices** — `WhoStep.tsx`: change `<Stepper current={0} />` to `<Stepper current={1} />`. `PickStep.tsx`: change `<Stepper current={1} />` to `<Stepper current={2} />`.

- [ ] **Step 4: Export `WhenStep`** — add to `components/night/index.ts`:

```ts
export { WhenStep } from "./WhenStep";
```

- [ ] **Step 5: Wire the container** — edit `app/night/new.tsx`:
  - Imports: add `listNights` to the `lib/nights` import; add `nightDates` from `../../lib/calendar`; add `WhenStep` to the `../../components/night` import; ensure `todayLocalISO` is imported from `../../lib/date` (already is).
  - Add state near the other `useState`s:
    ```ts
    const [nightDatesSet, setNightDatesSet] = useState<Set<string>>(new Set());
    const today = todayLocalISO();
    ```
  - Initialize `step` to `"when"`: change `useState<Step>("who")` to `useState<Step>("when")`.
  - In the mount effect's `Promise.all`, add a non-fatal nights fetch and store the dates:
    ```ts
    const [roster, current, allNights] = await Promise.all([
      fetchMembers(API_URL, GROUP_ID, controller.signal),
      getCurrentNight(API_URL, GROUP_ID, controller.signal),
      listNights(API_URL, GROUP_ID, controller.signal).catch(() => [] as Night[]),
    ]);
    setMembers(roster);
    setNightDatesSet(nightDates(allNights));
    ```
    (Keep the existing `if (current !== null && isResumable(current)) { … }` block below it.)
  - Change `onCreate` to accept the chosen date:
    ```ts
    const onCreate = useCallback(
      async (scheduledFor: string) => {
        const created = await runNightWrite(
          "create",
          () => createNight(API_URL, GROUP_ID, scheduledFor),
          "failed to create night",
          true,
        );
        if (created !== null) {
          setStep("who");
        }
      },
      [runNightWrite],
    );
    ```
  - Replace the `night === null` branch in the render (the "Start tonight's night" intro `<View style={styles.start}>…</View>`) with:
    ```tsx
    {night === null ? (
      <WhenStep today={today} nightDates={nightDatesSet} busy={busy} onNext={onCreate} />
    ) : step === "who" ? (
    ```
  - Remove the now-unused `start`/`hint` style keys and any now-unused imports (let `just lint`/`just typecheck` flag them).

- [ ] **Step 6: Verify**

Run: `cd mobile && just check`
Expected: lint + typecheck + tests pass.

- [ ] **Step 7: Manual smoke (seeded "Friday Film Club")**

Run: `cd mobile && just start` (press `i`/`a`/`w` or scan the QR). Confirm: Plan a night opens on When; "Tonight" is selected ember; a seeded night's date shows an ember dot; tapping a future day flips the footer to `PLANNING` + a relative label; "Next: who's coming →" with Tonight selected creates the night and advances to Who, which still runs through to Recorded.

- [ ] **Step 8: Commit**

```bash
cd mobile && git add components/night/ app/night/new.tsx
git commit -m "feat(mobile): When step + Calendar entry point (#44)"
```

---

### Task 6: Scheduled branch — date-aware Who + Scheduled screen

**Goal:** Branch the flow on the date — a future night reframes attendance to "Who's coming?", locks the picker, skips film search, and lands on the Scheduled ✓ screen; tonight is unchanged. Resume a scheduled night onto that screen.

**Files:**
- Create: `mobile/components/night/ScheduledStep.tsx`
- Modify: `mobile/components/night/WhoStep.tsx` (date-aware copy), `components/night/index.ts` (export `ScheduledStep`), `app/night/new.tsx` (branch + render + resume)

**Acceptance Criteria:**
- [ ] For a future night, Who's step reads "Who's coming?" with the planning hint and a "Schedule — {first} picks →" CTA; the heading shows `formatWeekdayDate` + a relative `Badge`. Tonight keeps today's wording.
- [ ] Advancing a future night records the picker and lands on Scheduled ✓ (date hero, picker spotlight "{name} picks" / "CHOOSES THE FILM THAT NIGHT" / "✦ Up", coming-cluster, single Done). Tonight advances to Pick → Recorded unchanged.
- [ ] Re-opening the wizard with the scheduled night resumes on the Scheduled screen (via `deriveInitialStep`).
- [ ] No repeat chip and no "Add to calendar"/"Notify" buttons.

**Verify:** `cd mobile && just check` passes; then run the app — a future date runs Who(coming) → Scheduled; re-open resumes Scheduled; Tonight still reaches Recorded.

**Steps:**

- [ ] **Step 1: Create `mobile/components/night/ScheduledStep.tsx`:**

```tsx
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Clock } from "lucide-react-native";

import { AppButton, Avatar, Badge, SectionLabel } from "../";
import { WizardFooter } from "./WizardFooter";
import { countdownLabel, formatShortDate, weekday } from "../../lib/date";
import type { Member } from "../../lib/members";
import type { Night } from "../../lib/nights";
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
} from "../../theme";

// ScheduledStep is the future-night terminal: the date hero with a countdown, the
// locked picker (who chooses the film on the night), and who's coming. Recurrence,
// calendar export, and notify are later phases and intentionally absent.
export function ScheduledStep({
  night,
  members,
  onDone,
}: {
  night: Night;
  members: Member[];
  onDone: () => void;
}) {
  const pickerName = members.find((m) => m.id === night.pickerId)?.name ?? "";
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Badge label="Scheduled ✓" tone="solid" />
          <Text style={styles.heroWeekday} allowFontScaling={false}>
            {weekday(night.scheduledFor, true)}
          </Text>
          <Text style={styles.heroDate} allowFontScaling={false}>
            {formatShortDate(night.scheduledFor)}
          </Text>
          <View style={styles.countdownRow}>
            <Clock size={13} color={colors.accent.strong} />
            <Text style={styles.countdown} allowFontScaling={false}>
              {countdownLabel(night.scheduledFor)}
            </Text>
          </View>
        </View>

        <SectionLabel>{"On the night"}</SectionLabel>
        <View style={styles.pickerRow}>
          <Avatar name={pickerName} size={40} glow />
          <View style={styles.pickerText}>
            <Text style={styles.pickerName} numberOfLines={1}>
              {`${pickerName} picks`}
            </Text>
            <Text style={styles.pickerSub} allowFontScaling={false}>
              {"CHOOSES THE FILM THAT NIGHT"}
            </Text>
          </View>
          <Badge label="✦ Up" uppercase={false} />
        </View>

        <SectionLabel>{`Coming · ${night.attendees.length}`}</SectionLabel>
        <View style={styles.cluster}>
          {night.attendees.map((a, i) => (
            <View key={a.id} style={[styles.clusterAvatar, i > 0 && styles.clusterOverlap]}>
              <Avatar name={a.name} size={40} />
            </View>
          ))}
        </View>
      </ScrollView>
      <WizardFooter>
        <AppButton title="Done" fullWidth onPress={onDone} />
      </WizardFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: space[6] },
  hero: {
    marginTop: space[3],
    paddingVertical: space[6],
    paddingHorizontal: space[6],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.dark,
    alignItems: "center",
    ...shadow.spotlight,
  },
  heroWeekday: {
    fontFamily: fontFamily.display,
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: trackPx(40, "display"),
    color: colors.text.primary,
    marginTop: space[4],
  },
  heroDate: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    letterSpacing: trackPx(24, "display"),
    color: colors.text.secondary,
    marginTop: space[1],
  },
  countdownRow: { flexDirection: "row", alignItems: "center", gap: space[1], marginTop: space[3] },
  countdown: { ...textPresets.tag, color: colors.accent.strong },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    backgroundColor: colors.surface.spotlight,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.accent.base,
    ...shadow.spotlight,
  },
  pickerText: { flex: 1 },
  pickerName: { fontFamily: fontFamily.sansSemibold, fontSize: fontSize.base, color: colors.text.primary },
  pickerSub: { ...textPresets.tag, color: colors.text.secondary, marginTop: space[1] },
  cluster: { flexDirection: "row", paddingTop: space[2] },
  clusterAvatar: { borderRadius: radius.full, borderWidth: 3, borderColor: colors.surface.page },
  clusterOverlap: { marginLeft: -space[2] },
});
```

- [ ] **Step 2: Make `WhoStep` date-aware** — edit `components/night/WhoStep.tsx`:
  - Add `future: boolean` to the props type and destructure it.
  - Change the date import to include the full set used: `import { formatWeekdayDate, relativeLabel } from "../../lib/date";` (drop `formatShortDate` if no longer used here).
  - Replace the heading line `<Text style={styles.heading}>{`Night of ${formatShortDate(night.scheduledFor)}`}</Text>` with a heading row carrying a relative badge:
    ```tsx
    <View style={styles.headingRow}>
      <Text style={styles.heading} numberOfLines={1}>
        {formatWeekdayDate(night.scheduledFor)}
      </Text>
      <Badge label={relativeLabel(night.scheduledFor)} uppercase={false} />
    </View>
    ```
  - Replace the static hint with: `{future ? "Who's planning to come? The next-up member who's in gets the pick." : "Tap who made it. Tonight's pick goes to whoever's next up and here."}`
  - Replace the `SectionLabel` text with: `{future ? "Who's coming?" : "Who's here?"}`
  - Change the footer CTA title from `picker ? \`Next — ${firstNameOf(picker.name)} picks  →\` : "Add who's here  →"` to:
    ```ts
    title={
      picker
        ? `${future ? "Schedule" : "Next"} — ${firstNameOf(picker.name)} picks  →`
        : "Add who's here  →"
    }
    ```
  - In the `StyleSheet`, replace the `heading` key's `marginTop` usage by adding a `headingRow` key and trimming `heading`:
    ```ts
    headingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space[3],
      marginTop: space[4],
    },
    heading: { ...textPresets.screenTitle, color: colors.text.primary, flexShrink: 1 },
    ```

- [ ] **Step 3: Export `ScheduledStep`** — add to `components/night/index.ts`:

```ts
export { ScheduledStep } from "./ScheduledStep";
```

- [ ] **Step 4: Branch + render + resume in `app/night/new.tsx`:**
  - Import: add `daysUntil` to the `../../lib/date` import; add `ScheduledStep` to the `../../components/night` import.
  - Generalize the advance handler — rename `onAdvanceToPick` to `onAdvance` and branch on the recorded night's date:
    ```ts
    const onAdvance = useCallback(async () => {
      const top = order[0] ?? null;
      if (night === null || top === null) {
        return;
      }
      const recorded = await runNightWrite(
        top.id,
        () => recordNightPick(API_URL, GROUP_ID, night.id, top.id),
        "failed to record pick",
      );
      if (recorded !== null) {
        setStep(daysUntil(recorded.scheduledFor, today) > 0 ? "scheduled" : "pick");
      }
    }, [night, order, runNightWrite, today]);
    ```
  - In the `WhoStep` render, pass the future flag and the renamed handler:
    ```tsx
    <WhoStep
      night={night}
      members={members}
      order={order}
      attendeeIds={attendeeIds}
      busy={busy}
      future={daysUntil(night.scheduledFor, today) > 0}
      onToggle={onToggle}
      onNext={onAdvance}
    />
    ```
  - Add the `scheduled` render branch (before the final `RecordedStep` else):
    ```tsx
    ) : step === "scheduled" ? (
      <ScheduledStep night={night} members={members} onDone={() => router.back()} />
    ) : (
    ```
  - Update the top-bar `title` and `back` for the scheduled terminal:
    ```ts
    const title =
      step === "pick" ? "The pick" : step === "recorded" ? "Tonight" : "New night";
    // …
    back={step === "recorded" || step === "scheduled" ? undefined : back}
    ```

- [ ] **Step 5: Verify**

Run: `cd mobile && just check`
Expected: lint + typecheck + tests pass.

- [ ] **Step 6: Manual (seeded "Friday Film Club")**

Run: `cd mobile && just start`. Confirm:
  1. When → pick a **future** date → "Next: who's coming →" → Who reads "Who's coming?" with the relative badge → "Schedule — {first} picks →" → **Scheduled ✓** (date hero, picker row, coming cluster, Done).
  2. Re-open Plan a night → resumes on the **Scheduled** screen.
  3. When → **Tonight** → Who → Pick → **Recorded** still works.

- [ ] **Step 7: Commit**

```bash
cd mobile && git add components/night/ app/night/new.tsx
git commit -m "feat(mobile): future-night Scheduled flow (#45)"
```

---

## Self-review notes

- **Spec coverage:** Calendar component (T3) ✓; `nightDates` selector (T1) ✓; When step + chips + footer (T5) ✓; date-aware Who (T6) ✓; Scheduled screen (T6) ✓; dropped repeat/export/notify (T6 AC) ✓; resume-into-Scheduled (T2 + T6) ✓; step extraction (T4) ✓; pure-logic tests (T1, T2) ✓.
- **Type consistency:** `YearMonth`, `DayCell`, `DayState`, `dayState`, `monthGrid`, `shiftMonth`, `nightDates` defined in T1 and used identically in T3/T5; `Step` extended in T2 and rendered in T5/T6; `onNext(iso)` / `onCreate(scheduledFor)` / `onAdvance` consistent across T5/T6.
- **No backend changes** anywhere; `createNight`/`listNights`/`recordNightPick` used as-is.
