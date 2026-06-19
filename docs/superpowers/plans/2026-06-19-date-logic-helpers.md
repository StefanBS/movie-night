# Date logic helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five date helpers (`weekday`, `daysUntil`, `formatWeekdayDate`, `relativeLabel`, `countdownLabel`) to `mobile/lib/date.ts`, ported from the design-handoff prototype but computed against device today.

**Architecture:** Pure functions over `YYYY-MM-DD` strings, added to the existing `mobile/lib/date.ts`. A private `parseLocalDate` builds a local-midnight `Date` (no UTC parsing), keeping everything timezone-independent like the file's existing formatters. Today-relative functions take an optional `today` ISO arg defaulting to `todayLocalISO()` — production passes nothing, tests inject a fixed anchor (no mocks).

**Tech Stack:** TypeScript, Node's built-in `node:test` runner via `tsx`, table-driven assertions (`node:assert/strict`).

**User decisions (already made):**
- Name the weekday+date formatter `formatWeekdayDate` (follow the file's `format*` convention, not the prototype's `fmtWeekdayDate`).
- `countdownLabel` uses polished grammar: add `yesterday`; `±1` are special-cased so day-count branches are always plural.
- `relativeLabel` is ported faithfully (Tonight / Tomorrow / This <Weekday> / Next <Weekday> / full).
- Scope is exactly these five functions — `upcomingDates` is out (that's #49).
- Inject "today" as an optional ISO string defaulting to `todayLocalISO()`.

---

## File Structure

- `mobile/lib/date.ts` — **modify.** Append the weekday name arrays, the private `parseLocalDate` helper, and the five exported functions to the existing file (which already holds `todayLocalISO`, `formatShortDate`, `formatMonthYear`).
- `mobile/lib/date.test.ts` — **modify.** Extend the existing table-driven test file with cases for the five new functions.

Two tasks: primitives first (`parseLocalDate`, `weekday`, `daysUntil`), then the three label functions that build on them.

### Reference: current `mobile/lib/date.ts` tail (for context)

```ts
const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatShortDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${SHORT_MONTHS[month - 1]} ${day}`;
}
```

`formatShortDate` produces `"Jun 19"` and is reused by `formatWeekdayDate`. `todayLocalISO(now = new Date())` is already exported and is the default "today" source.

---

### Task 1: Date primitives — `weekday` + `daysUntil`

**Goal:** Add the private `parseLocalDate` helper, weekday name arrays, and the two primitive functions `weekday` and `daysUntil`, with table-driven tests.

**Files:**
- Modify: `mobile/lib/date.ts` (append after `formatMonthYear`)
- Test: `mobile/lib/date.test.ts` (append; add `daysUntil`, `weekday` to the import)

**Acceptance Criteria:**
- [ ] `weekday(iso)` returns the short name (`"Fri"`); `weekday(iso, true)` returns the long name (`"Friday"`).
- [ ] `daysUntil(iso, today)` returns whole calendar days (0 same day, positive future, negative past), correct across month and year boundaries.
- [ ] `daysUntil(iso)` with no second arg computes against `todayLocalISO()`.
- [ ] All `mobile/lib/date.test.ts` cases pass.

**Verify:** `cd mobile && node --import tsx --test lib/date.test.ts` → all tests pass (0 fail).

**Steps:**

- [ ] **Step 1: Write the failing tests** — append to `mobile/lib/date.test.ts`, and extend the existing import line.

Change the import at the top of the file from:

```ts
import { formatMonthYear, formatShortDate, todayLocalISO } from "./date";
```

to:

```ts
import {
  daysUntil,
  formatMonthYear,
  formatShortDate,
  todayLocalISO,
  weekday,
} from "./date";
```

Append these tests to the end of the file:

```ts
// weekday() and daysUntil() are built from local-time components, so these
// assertions are timezone-independent. daysUntil takes an explicit `today`
// anchor for determinism.

test("weekday returns the short name by default", () => {
  assert.equal(weekday("2026-06-19"), "Fri");
});

test("weekday returns the long name when long=true", () => {
  assert.equal(weekday("2026-06-19", true), "Friday");
});

test("weekday handles Sunday (index 0) and Saturday (index 6)", () => {
  assert.equal(weekday("2026-06-21", true), "Sunday");
  assert.equal(weekday("2026-06-20", true), "Saturday");
});

test("daysUntil is 0 for the same day", () => {
  assert.equal(daysUntil("2026-06-19", "2026-06-19"), 0);
});

test("daysUntil is positive for a future date", () => {
  assert.equal(daysUntil("2026-06-26", "2026-06-19"), 7);
});

test("daysUntil is negative for a past date", () => {
  assert.equal(daysUntil("2026-06-18", "2026-06-19"), -1);
});

test("daysUntil counts across a month boundary", () => {
  assert.equal(daysUntil("2026-07-01", "2026-06-19"), 12);
});

test("daysUntil counts across a year boundary", () => {
  assert.equal(daysUntil("2027-01-01", "2026-12-31"), 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd mobile && node --import tsx --test lib/date.test.ts`
Expected: FAIL — `weekday`/`daysUntil` are not exported (TypeScript/runtime error on the import).

- [ ] **Step 3: Write the implementation** — append to `mobile/lib/date.ts` after `formatMonthYear`.

```ts
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

// parseLocalDate turns a YYYY-MM-DD string into a Date at local midnight. Like
// the formatters above it splits the string by hand instead of letting Date
// parse the ISO text (which would treat it as UTC), so day math stays anchored
// to the device's own calendar day.
function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// weekday returns the day-of-week name for a YYYY-MM-DD string — short ("Fri")
// by default, long ("Friday") when `long` is true.
export function weekday(iso: string, long = false): string {
  const names = long ? WEEKDAYS_LONG : WEEKDAYS_SHORT;
  return names[parseLocalDate(iso).getDay()];
}

// daysUntil returns the whole number of calendar days from `today` to `iso`
// (negative for past dates). `today` defaults to the device's local date.
// Rounding absorbs the 23h/25h days at daylight-saving boundaries so the count
// stays a whole number of calendar days.
export function daysUntil(iso: string, today: string = todayLocalISO()): number {
  const ms = parseLocalDate(iso).getTime() - parseLocalDate(today).getTime();
  return Math.round(ms / 86_400_000);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd mobile && node --import tsx --test lib/date.test.ts`
Expected: PASS — all tests pass, 0 fail.

- [ ] **Step 5: Lint + typecheck**

Run: `cd mobile && just lint && just typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/date.ts mobile/lib/date.test.ts
git commit -m "Add weekday + daysUntil date primitives (#43)"
```

---

### Task 2: Label helpers — `formatWeekdayDate` + `relativeLabel` + `countdownLabel`

**Goal:** Add the three label functions that compose the primitives, with table-driven tests covering every branch and boundary.

**Files:**
- Modify: `mobile/lib/date.ts` (append after `daysUntil`)
- Test: `mobile/lib/date.test.ts` (append; add the three names to the import)

**Acceptance Criteria:**
- [ ] `formatWeekdayDate("2026-06-19")` → `"Friday, Jun 19"` (long weekday + un-padded short date).
- [ ] `relativeLabel` returns `Tonight` (0), `Tomorrow` (1), `This <Weekday>` (2–6), `Next <Weekday>` (7–13), and the full `formatWeekdayDate` for ≥14 or any past date.
- [ ] `countdownLabel` returns `tonight` (0), `tomorrow` (1), `yesterday` (-1), `in N days` (>1), `N days ago` (<-1).
- [ ] All `mobile/lib/date.test.ts` cases pass.

**Verify:** `cd mobile && node --import tsx --test lib/date.test.ts` → all tests pass (0 fail).

**Steps:**

- [ ] **Step 1: Write the failing tests** — extend the import and append tests to `mobile/lib/date.test.ts`.

Extend the import added in Task 1 to also include the three label functions:

```ts
import {
  countdownLabel,
  daysUntil,
  formatMonthYear,
  formatShortDate,
  formatWeekdayDate,
  relativeLabel,
  todayLocalISO,
  weekday,
} from "./date";
```

Append these tests to the end of the file:

```ts
// Label functions. relativeLabel/countdownLabel take an explicit `today` anchor
// so the day-count windows are deterministic. Anchored on Fri 2026-06-19.

test("formatWeekdayDate renders long weekday + short date", () => {
  assert.equal(formatWeekdayDate("2026-06-19"), "Friday, Jun 19");
});

test("formatWeekdayDate does not zero-pad the day", () => {
  assert.equal(formatWeekdayDate("2026-01-05"), "Monday, Jan 5");
});

test("formatWeekdayDate handles a December date", () => {
  assert.equal(formatWeekdayDate("2025-12-31"), "Wednesday, Dec 31");
});

test("relativeLabel says Tonight for today", () => {
  assert.equal(relativeLabel("2026-06-19", "2026-06-19"), "Tonight");
});

test("relativeLabel says Tomorrow for the next day", () => {
  assert.equal(relativeLabel("2026-06-20", "2026-06-19"), "Tomorrow");
});

test("relativeLabel says This <Weekday> within the week (2-6 days)", () => {
  assert.equal(relativeLabel("2026-06-21", "2026-06-19"), "This Sunday");
  assert.equal(relativeLabel("2026-06-25", "2026-06-19"), "This Thursday");
});

test("relativeLabel says Next <Weekday> for 7-13 days out", () => {
  assert.equal(relativeLabel("2026-06-26", "2026-06-19"), "Next Friday");
  assert.equal(relativeLabel("2026-07-02", "2026-06-19"), "Next Thursday");
});

test("relativeLabel falls back to the full date at 14 days out", () => {
  assert.equal(relativeLabel("2026-07-03", "2026-06-19"), "Friday, Jul 3");
});

test("relativeLabel falls back to the full date for past dates", () => {
  assert.equal(relativeLabel("2026-06-01", "2026-06-19"), "Monday, Jun 1");
});

test("countdownLabel handles tonight / tomorrow / yesterday", () => {
  assert.equal(countdownLabel("2026-06-19", "2026-06-19"), "tonight");
  assert.equal(countdownLabel("2026-06-20", "2026-06-19"), "tomorrow");
  assert.equal(countdownLabel("2026-06-18", "2026-06-19"), "yesterday");
});

test("countdownLabel counts future and past days", () => {
  assert.equal(countdownLabel("2026-06-24", "2026-06-19"), "in 5 days");
  assert.equal(countdownLabel("2026-06-16", "2026-06-19"), "3 days ago");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd mobile && node --import tsx --test lib/date.test.ts`
Expected: FAIL — `formatWeekdayDate`/`relativeLabel`/`countdownLabel` are not exported.

- [ ] **Step 3: Write the implementation** — append to `mobile/lib/date.ts` after `daysUntil`.

```ts
// formatWeekdayDate renders a YYYY-MM-DD string as a full "Friday, Jun 19"
// label, composing the long weekday with the existing short-date formatter.
export function formatWeekdayDate(iso: string): string {
  return `${weekday(iso, true)}, ${formatShortDate(iso)}`;
}

// relativeLabel describes a date relative to today in movie-night terms:
// "Tonight" / "Tomorrow" / "This Friday" (2-6 days out) / "Next Friday"
// (7-13 days out) / the full weekday date for anything further out or in the
// past. `today` defaults to the device's local date.
export function relativeLabel(iso: string, today: string = todayLocalISO()): string {
  const n = daysUntil(iso, today);
  if (n === 0) return "Tonight";
  if (n === 1) return "Tomorrow";
  if (n > 1 && n < 7) return `This ${weekday(iso, true)}`;
  if (n >= 7 && n < 14) return `Next ${weekday(iso, true)}`;
  return formatWeekdayDate(iso);
}

// countdownLabel renders a short lowercase countdown: "tonight" / "tomorrow" /
// "yesterday" / "in N days" / "N days ago". The ±1 cases are named, so the
// day-count branches only ever render N >= 2 and are always plural. `today`
// defaults to the device's local date.
export function countdownLabel(iso: string, today: string = todayLocalISO()): string {
  const n = daysUntil(iso, today);
  if (n === 0) return "tonight";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 0) return `in ${n} days`;
  return `${-n} days ago`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd mobile && node --import tsx --test lib/date.test.ts`
Expected: PASS — all tests pass, 0 fail.

- [ ] **Step 5: Full mobile check (lint + typecheck + test)**

Run: `cd mobile && just check`
Expected: lint, typecheck, and the full test suite all pass.

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/date.ts mobile/lib/date.test.ts
git commit -m "Add relativeLabel, countdownLabel, formatWeekdayDate (#43)"
```

---

## Self-Review

- **Spec coverage:** All five functions from the spec are covered — `weekday`/`daysUntil` (Task 1), `formatWeekdayDate`/`relativeLabel`/`countdownLabel` (Task 2). The "today" injection (optional ISO default `todayLocalISO()`), `parseLocalDate` local-midnight helper, `Math.round` DST note, and `formatWeekdayDate` reusing `formatShortDate` are all in the implementation steps. `upcomingDates` is correctly excluded (non-goal). Test list matches the spec's testing section (weekday Sun/Sat, daysUntil month/year boundaries, relativeLabel all branches + boundaries n=1,2,6,7,13,14 + past, countdownLabel tonight/tomorrow/yesterday/in N/N ago).
- **Placeholders:** none — every code step shows complete code and exact commands.
- **Type consistency:** `weekday(iso, long?)`, `daysUntil(iso, today?)`, `formatWeekdayDate(iso)`, `relativeLabel(iso, today?)`, `countdownLabel(iso, today?)` are used consistently across tasks and tests; `parseLocalDate` is private; the import line is grown additively in both tasks.
