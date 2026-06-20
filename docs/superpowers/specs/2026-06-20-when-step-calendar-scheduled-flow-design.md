# Plan a night on any date — Calendar, When step & Scheduled flow

Issues: [#44](https://github.com/StefanBS/movie-night/issues/44) (Calendar component
+ When step) **and** [#45](https://github.com/StefanBS/movie-night/issues/45)
(Scheduled future-night flow), shipped together · Part of
[#28](https://github.com/StefanBS/movie-night/issues/28) (Phase 3, handoff
screens 5–6 + 8).

## Goal

A movie night no longer has to be tonight. Prepend a **When** step to the night
wizard — a "Tonight" chip + a bespoke month **Calendar** — and branch the flow on
the chosen date: **tonight runs straight through to Recorded (unchanged); a future
date schedules the night** (picker locked now, film chosen on the night) and ends
on a new **Scheduled ✓** screen.

Done when, against the seeded "Friday Film Club" group: picking *today* runs the
existing Who → Pick → Recorded flow; picking a *future* date runs Who(coming) →
Scheduled; the calendar shows dots on dates that already have nights; and
`just check` passes. **No backend changes** — `createNight` already accepts a
future `scheduledFor`, and a "scheduled night" is just a `Night` with
`scheduledFor ≥ today` and `movie === null`.

#44 and #45 are combined because #44 alone is incoherent: it introduces the
ability to *pick* a future date, while #45 is what makes a future date *behave*
differently. Split, #44 would either ship a half-broken flow (attach a movie to
next Saturday tonight) or dead code.

## Decisions (locked in brainstorming)

- **Quick chips: "Tonight" only.** The other dates come from the calendar grid.
  No dynamic weekend-date helper (the prototype's hardcoded `Fri 19 / Sat 20` is
  dropped).
- **Build our own calendar**, not an OS picker or `react-native-calendars`. The
  issue is a component spec (34px day circles, ember dots, today ring, past
  dimming); a native picker can't render it and a library would be heavy to theme.
  No new dependency.
- **Extract the wizard steps now.** All five step views move to `components/night/`;
  `app/night/new.tsx` becomes a lean container.
- **Resume into Scheduled.** Re-opening the wizard with a future, picker-locked
  night lands on the Scheduled confirmation (see Resume edge).

## Architecture & files

The night wizard already separates a stateful container from presentational step
views passed props. This slice formalizes that: the container keeps **all** data
and orchestration; every step becomes a self-contained component.

**New — reusable primitive**

- **`components/Calendar.tsx`** — presentational month picker (faithful port of the
  prototype `Calendar`). Props `{ value, today, month, nightDates, onPick, onMonth }`
  where `value`/`today` are ISO strings and `month` is `{ year, month }` (1-based);
  renders `monthGrid()` output, uses `lucide-react-native`'s
  `ChevronLeft`/`ChevronRight` and only `theme/` tokens. No data, no business logic.

**New — pure logic (`lib/`, table-driven, no mocks)**

- **`lib/calendar.ts`** — `monthGrid`, `shiftMonth`, `nightDates`, `dayState`
  (see below).
- **`lib/calendar.test.ts`** — table cases for all three.

**New — step components (`components/night/`)**

- `Stepper.tsx`, `WizardFooter.tsx` — shared chrome lifted out of `new.tsx`.
- `WhenStep.tsx`, `WhoStep.tsx`, `PickStep.tsx`, `RecordedStep.tsx`,
  `ScheduledStep.tsx` — `WhoStep`/`PickStep`/`RecordedStep` are **moved verbatim**
  (behavior-preserving) from `new.tsx`; `WhenStep`/`ScheduledStep` are new.
- Each owns its `StyleSheet`; shared chrome carries its own styles. Trivial
  duplicate style objects across steps are acceptable (RN norm) — no shared styles
  module yet (build as we go).
- `components/night/index.ts` — barrel for the container's imports.

> Step components live in `components/night/`, **not** `app/night/`, because
> expo-router treats files under `app/` as routes. This is the `components/night/`
> location the night-flow spec already reserved as its "safety valve."

**Edited**

- **`app/night/new.tsx`** — reduced to the container: data fetch, the
  `runNightWrite` envelope, all `on*` handlers, `step` state, the render switch,
  and the `TopBar`. Drops the inline step JSX + the big shared `StyleSheet`.
- **`lib/nightFlow.ts`** — extend `Step`; add the `scheduled` resume branch.
- **`lib/nightFlow.test.ts`** — cases for the new signature + branch.

No changes to `lib/nights.ts`, `lib/movies.ts`, `lib/turn.ts`, the backend, or
other `components/`.

## Pure logic

### `lib/calendar.ts`

Computed from numbers/strings the same timezone-safe way as `lib/date.ts`
(`new Date(year, monthIndex, …)` with numeric args constructs local midnight; no
ISO-string parsing).

```ts
import { daysUntil } from "./date";
import type { Night } from "./nights";

// A calendar cell: a day, or null for the blank leading slots before the 1st.
export type DayCell = { iso: string; day: number } | null;

// monthGrid lays out one month (month: 1–12) as left-to-right, top-to-bottom
// cells: `firstWeekday` leading blanks (Sun=0) then one cell per day, each
// carrying its YYYY-MM-DD. The column math is the fiddly part — isolated here so
// it is unit-testable without rendering.
export function monthGrid(year: number, month: number): DayCell[] {
  const firstWeekday = new Date(year, month - 1, 1).getDay();   // 0=Sun … 6=Sat
  const daysInMonth = new Date(year, month, 0).getDate();        // day 0 of next
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
// Dec↔Jan boundary. Isolated for the off-by-one/rollover test.
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

// dayState classifies one day for the renderer, encoding the precedence the
// prototype applies inline: the has-night dot is hidden under the selection, and
// `past` is purely date-relative (past days stay selectable). Extracted so the
// precedence is testable rather than buried in JSX.
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

Test cases (`lib/calendar.test.ts`):
- **monthGrid** — month starting Sunday → 0 leading blanks; starting Saturday → 6;
  day counts for 31- (Jul), 30- (Jun), 29- (Feb 2024 leap), 28-day (Feb 2026)
  months; total length = blanks + days; ISO zero-padding (`2026-06-01`,
  `2026-06-09`); first/last cell ISO correct.
- **shiftMonth** — +1 within year; −1 within year; Dec +1 → next Jan; Jan −1 →
  prev Dec.
- **nightDates** — empty → empty set; duplicate `scheduledFor` collapses to one;
  distinct dates preserved.
- **dayState** — selected; today (not selected); hasNight present; **hasNight
  suppressed when also selected**; past true (yesterday) / false (today boundary,
  `daysUntil === 0` is not past) / false (future).

### `lib/nightFlow.ts`

```ts
export type Step = "when" | "who" | "pick" | "recorded" | "scheduled";

// deriveInitialStep maps a resumed night to its step. A future night whose picker
// is locked (movie still null) resumes on the Scheduled confirmation; everything
// else keeps today's behavior — recorded when a movie is attached, otherwise the
// non-destructive "who" (picker is re-derived on advancing; "pick" stays a
// forward-only transition, never a resume target). `today` is injectable for
// deterministic tests (mirrors lib/date.ts).
export function deriveInitialStep(night: Night, today = todayLocalISO()): Step {
  if (night.movie !== null) return "recorded";
  if (night.pickerId !== null && daysUntil(night.scheduledFor, today) > 0) {
    return "scheduled";
  }
  return "who";
}
```

`isResumable` is unchanged (`night.movie === null`). New/updated test cases:
movie present → `recorded`; future + picker → `scheduled`; future + no picker →
`who`; **tonight + picker → `who`** (forward-only preserved); past + picker + no
movie → `who` (a future night opened after its date is no longer "future");
no picker → `who`.

## Container: `app/night/new.tsx`

Keeps the existing data/orchestration; the only structural change is rendering
extracted components and adding the When/Scheduled paths.

- **`step` state** initializes to `"when"`. Render rule: **`night === null` →
  `<WhenStep>`** (replacing today's "Start tonight's night" intro); otherwise render
  by `step`.
- **On mount** — add `listNights(API_URL, GROUP_ID)` to the existing
  `Promise.all([fetchMembers, getCurrentNight])`; derive `nightDates(nights)` for
  the calendar dots. If a resumable night exists, resume it
  (`setStep(deriveInitialStep(night))`, fetch its turn order); else stay on `when`.
- **WhenStep** owns its own UI state (`selected` ISO defaulting to today,
  `month: YearMonth` defaulting to today's year/month, moved via `shiftMonth`) — it
  is just a date picker that reports the chosen date. It receives `nightDates` +
  `today`; "Next: who's coming →" calls
  the container's **`onCreate(iso)`** → `createNight(API_URL, GROUP_ID, iso)` then
  `setStep("who")`. (`onCreate` gains an ISO parameter; today it hardcodes
  `todayLocalISO()`.)
- **Branch after Who** — `onAdvance` records the auto-picker (`recordNightPick`,
  unchanged — this credits the turn) then routes on
  `future = daysUntil(night.scheduledFor) > 0`: `setStep(future ? "scheduled" :
  "pick")`. The container computes `future` and passes it to `WhoStep` for copy.
- **Back/title** — When step back = "Cancel" → `router.back()`; Who back =
  "Cancel"; Pick back = "Here"; Scheduled/Recorded = no back. Titles: "New night"
  (when/who), "The pick" (pick), "Tonight" (recorded), "New night" (scheduled).

## The steps

### When (`step` implied by `night === null`)

Port of `NightDateScreen`. Stepper at step 0 (`["When","Here","Pick","Done"]` — the
stepper grows to four). Serif heading "When's the night?" + hint "Tonight, or pick
any date to plan ahead." A single **"Tonight"** chip (solid ember when the
selection is today, card otherwise) inside the card containing `<Calendar>`. Sticky
`WizardFooter`: a mono `PLANNING`/`TONIGHT` tag (by `future`) + the ember
`relativeLabel(selected)`, then the primary **"Next: who's coming →"**.

### Calendar (`components/Calendar.tsx`)

Serif `MonthName YYYY` header + two `IconButton`-style chevrons (`onMonth(±1)`);
mono `S M T W T F S` row; a 7-col grid (`flexDirection:"row"`, `flexWrap:"wrap"`,
each cell `width:"14.285%"`). Each day = a 34px circle above a 4px dot, driven by
`dayState`: **selected** → solid `accent.base` fill + `text.onAccent` + ember
shadow; **today** (unselected) → 1.5px `accent.strong` ring; **past** → dimmed
(`text.tertiary`); **hasNight** → ember dot under the number (hidden under
selection). Blank cells render an empty spacer. Tapping a day → `onPick(iso)`;
**past days stay tappable** (you can record a night you forgot to log).

### Who's here / coming (`components/night/WhoStep.tsx`)

The existing step, made date-aware via the `future` prop:
- Heading becomes `formatWeekdayDate(night.scheduledFor)` with a small inline
  accent pill showing `relativeLabel(...)` (not a new shared component).
- `future` → SectionLabel "Who's coming?", hint "Who's planning to come? The
  next-up member who's in gets the pick.", CTA "Schedule — {first} picks →".
  Else today's wording ("Who's here?" / "Next — {first} picks →").
- Attendance toggles, picker spotlight, and the `runNightWrite` plumbing are
  unchanged.

### The pick / Recorded

`PickStep` and `RecordedStep` move to `components/night/` **unchanged** (tonight
path only). `RecordedStep`'s "picked by … · {date}" keeps `formatShortDate`.

### Scheduled (`components/night/ScheduledStep.tsx`)

Port of `NightScheduledScreen`, **trimmed to in-scope elements**:
- **Date hero** on `surface.dark` with an ember radial wash: solid `Scheduled ✓`
  `Badge`; big serif `weekday(date, true)` ("Friday"); serif `formatShortDate`
  ("Jun 26"); a mono countdown row (clock icon + `countdownLabel(date)`).
- **`SectionLabel` "On the night"** + picker spotlight row (`surface.spotlight` +
  ember border): picker `Avatar` + "{name} picks" + mono "CHOOSES THE FILM THAT
  NIGHT" + a `Badge` "✦ Up". Picker name from `night.pickerId` via `members`.
- **`SectionLabel` "Coming · {n}"** + overlapping avatar cluster of
  `night.attendees`.
- `WizardFooter`: a single primary **"Done"** → `router.back()`.

**Dropped from the prototype** (deferred phases): the **repeat chip** (recurrence,
Phase 4 #48/#49) and the **"Add to calendar" / "Notify the group"** ghost buttons
(native follow-ons, Phase 5 #50/#51).

## Edge & error states

- **Resume edge (known boundary).** `GetCurrentNight` returns the night with the
  greatest `scheduled_for` (no movie/date filter), so once a night is scheduled the
  wizard keeps resuming it — you can't start an *unrelated* fresh night from here
  until that night gets a movie. That is exactly what the home "Up next" card
  (#46) and Edit/cancel (#47) exist to handle; **this slice does not build
  multi-night management.** Resuming a future picker-locked night → Scheduled;
  resuming one whose date has since passed → `who`.
- **No present core member** on Who's here → no spotlight, CTA disabled (unchanged).
- **Calendar month with no nights** → no dots; **today always rings** even outside
  the current selection.
- **Write failures** → the existing inline `actionError` banner; controls disabled
  while `busy !== null`.
- **`listNights` failure** → dots simply don't render (empty set); it must not
  block the When step. Fold into the existing mount error handling but degrade the
  dots gracefully rather than failing the screen.

## Testing & verification

- **Pure logic** — `lib/calendar.test.ts` (monthGrid / nightDates / dayState) and
  updated `lib/nightFlow.test.ts`, table-driven on Node `node:test` via tsx, no
  mocks; weekday/day-count expectations cross-checked against the system `date`.
- **No RN render tests** — none in the repo; the Calendar and the two new steps
  are verified by running the app. Behavior-preserving moves of the existing three
  steps are covered by the unchanged manual flow.
- Per `mobile/AGENTS.md`, confirm any Expo SDK 56 API used (safe-area insets, svg)
  against <https://docs.expo.dev/versions/v56.0.0/>.
- **Gate**: `just check` (lint + typecheck + test) must pass.
- **Manual** (seeded "Friday Film Club"):
  1. Open Plan a night → land on When; "Tonight" selected; calendar shows a dot on
     any seeded night's date.
  2. Pick a future date → footer flips to `PLANNING` + "This/Next …"; "Next: who's
     coming →" → Who's **coming** → "Schedule — {first} picks →" → **Scheduled ✓**
     with the date hero, picker row, and coming cluster → Done returns.
  3. Re-open Plan a night → resumes the scheduled night on the Scheduled screen.
  4. Pick **Tonight** → existing Who → Pick → Recorded flow still works end-to-end.

## Out of scope

- Home "Up next" countdown card + `nextScheduledNight` selector (#46).
- Edit / cancel a scheduled night (#47).
- Recurrence/repeat (#48/#49), reminders (#50), calendar export (#51).
- Any backend, endpoint, or shared-primitive change beyond `components/Calendar.tsx`.
