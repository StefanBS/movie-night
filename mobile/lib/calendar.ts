import type { Night } from "./nights";

// A calendar cell: a day, or null for the blank leading slots before the 1st.
export type DayCell = { iso: string; day: number } | null;

const pad = (n: number) => String(n).padStart(2, "0");

// monthGrid lays out one month (month: 1–12) as left-to-right, top-to-bottom
// cells: `firstWeekday` leading blanks (Sun=0) then one cell per day, each
// carrying its YYYY-MM-DD. Numeric Date args construct local midnight (like
// lib/date.ts), so the column math stays timezone-independent.
export function monthGrid(year: number, month: number): DayCell[] {
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=Sun … 6=Sat
  const daysInMonth = new Date(year, month, 0).getDate(); // day 0 of next month
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

// yearMonthOf reads the displayed month out of a YYYY-MM-DD string. It splits
// the ISO text by hand rather than letting Date parse it (which would treat it
// as UTC and can land on the previous month west of Greenwich) — the same
// timezone-safety rule lib/date.ts follows.
export function yearMonthOf(iso: string): YearMonth {
  const [year, month] = iso.split("-").map(Number);
  return { year, month };
}

// shiftMonth rolls the displayed month by ±1, carrying the year across the
// Dec↔Jan boundary.
export function shiftMonth({ year, month }: YearMonth, dir: -1 | 1): YearMonth {
  const m = month + dir;
  if (m < 1) return { year: year - 1, month: 12 };
  if (m > 12) return { year: year + 1, month: 1 };
  return { year, month: m };
}

// nightDates is the named selector: the set of dates that already have a night,
// for the calendar dots. (A Night maps to exactly one scheduledFor.)
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
    // Both sides are zero-padded YYYY-MM-DD, so a string compare orders them
    // exactly like calendar days — and avoids parsing two Dates per cell, on a
    // grid that re-renders on every tap. Same fixed-width ISO ordering that
    // lib/history.ts and lib/nights.ts already sort on.
    past: iso < opts.today,
  };
}
