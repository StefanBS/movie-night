# Date logic helpers (#43)

**Issue:** [#43](https://github.com/StefanBS/movie-night/issues/43) — Scheduling P3.1 · part of #28 Phase 3.
**Date:** 2026-06-19

## Summary

Phase 3 (scheduling) needs the date math the redesigned screens are built on:
day counts, weekday names, and the human-friendly labels the calendar / "When"
step (#44), the scheduled-night flow (#45), and the "Up next" countdown card
(#46) will render. The design handoff prototype already wrote these as plain
functions in `design_handoff_app_redesign/prototype/data.js`; this issue ports
five of them into `mobile/lib/date.ts` alongside the formatters already there
(`todayLocalISO`, `formatShortDate`, `formatMonthYear`).

The one substantive change from the prototype: it computes everything against a
hardcoded `TODAY` constant, but the app must compute against **device today**.

## Goals

- Add `weekday`, `daysUntil`, `formatWeekdayDate`, `relativeLabel`, and
  `countdownLabel` to `mobile/lib/date.ts`.
- Today-relative functions default to the device's local date (`todayLocalISO()`)
  and accept an injected `today` for deterministic tests.
- Table-driven unit tests, no mocks (the repo convention).

## Non-goals

- **`upcomingDates`** (weekly-recurrence preview) — that's #49 (Phase 4). Not
  ported here.
- No new file: these live in the existing `mobile/lib/date.ts`.
- No screen wiring — consumers are #44–#46.
- `fmtDate`/`monthLabel` from the prototype are already ported
  (`formatShortDate` / `formatMonthYear`); not re-touched.

## The "today" injection decision

The prototype hardcodes `const TODAY = "2026-06-15"`. The issue requires
computing against device today. The chosen approach mirrors the file's existing
`todayLocalISO(now: Date = new Date())` pattern: today-relative functions take an
**optional ISO `today` string defaulting to `todayLocalISO()`**.

- Production calls pass nothing → device-local today.
- Tests pass a fixed `today` (e.g. `"2026-06-15"`) → deterministic, no clock
  faking, no mocks.

Rejected alternatives: a `now: Date` parameter (more awkward — everything else
here is string-based) and reading a module-level "today" (untestable without
mocks).

## API

```ts
// Pure formatters — no "today" needed.

// weekday("2026-06-19")        → "Fri"
// weekday("2026-06-19", true)  → "Friday"
export function weekday(iso: string, long = false): string;

// formatWeekdayDate("2026-06-19") → "Friday, Jun 19"
export function formatWeekdayDate(iso: string): string;

// Today-relative — optional `today` ISO, default todayLocalISO().

// Whole calendar days from `today` to `iso` (negative = past).
export function daysUntil(iso: string, today?: string): number;

// Tonight / Tomorrow / This <Weekday> / Next <Weekday> / "Friday, Jun 19"
export function relativeLabel(iso: string, today?: string): string;

// tonight / tomorrow / yesterday / "in N days" / "N days ago"
export function countdownLabel(iso: string, today?: string): string;
```

### Shared internals

- `parseLocalDate(iso)` → `new Date(y, m - 1, d)` — local midnight, no UTC
  parsing, same timezone-independent philosophy as the existing hand-split
  formatters.
- `WEEKDAYS_SHORT` / `WEEKDAYS_LONG` name arrays (Sun..Sat), indexed by
  `getDay()`.
- `daysUntil` is `Math.round((parseLocalDate(iso) - parseLocalDate(today)) /
  86_400_000)`. The `Math.round` is deliberate: across a DST boundary a local
  "day" is 23 h or 25 h, and rounding keeps the day count correct.
- `formatWeekdayDate` composes `weekday(iso, true)` + the existing
  `formatShortDate(iso)`.

### Label rules

**`relativeLabel`** — ported faithfully from the prototype:

| `daysUntil` | result |
|---|---|
| `0` | `Tonight` |
| `1` | `Tomorrow` |
| `2`–`6` | `This <Weekday>` (long) |
| `7`–`13` | `Next <Weekday>` (long) |
| `≥ 14` or any past date | `formatWeekdayDate(iso)` |

**`countdownLabel`** — polished grammar (one deliberate divergence from the
prototype, which emitted "1 days ago" and had no "yesterday"):

| `daysUntil` | result |
|---|---|
| `0` | `tonight` |
| `1` | `tomorrow` |
| `-1` | `yesterday` |
| `> 1` | `in N days` |
| `< -1` | `N days ago` |

`±1` are special-cased, so the day-count branches only ever render `N ≥ 2` —
plural is always correct and no singular "1 day" string can occur.

## Testing

`mobile/lib/date.test.ts`, extended in the existing table-driven `node:test`
style. Every today-relative case passes an explicit anchor `today` so results
are deterministic and timezone-independent.

- **`weekday`** — short and long names; cover Sunday (index 0) and Saturday
  (index 6) plus a midweek day.
- **`daysUntil`** — same day → `0`; a future date → positive; a past date →
  negative; across a month boundary and a year boundary.
- **`formatWeekdayDate`** — `"2026-06-19"` → `"Friday, Jun 19"`; a single-digit
  day (no zero-pad) and a December date.
- **`relativeLabel`** — every branch, hitting the boundaries `n = 1, 2, 6, 7,
  13, 14` and a past date (→ full).
- **`countdownLabel`** — `tonight`, `tomorrow`, `yesterday`, `in N days`,
  `N days ago`.

## Shared contract

None changed. These are leaf utility functions over ISO date strings; nothing in
the backend or the seed depends on them. Future screens (#44–#46) import them
from `mobile/lib/date.ts`.
