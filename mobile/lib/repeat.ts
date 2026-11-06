import { weekday } from "./date";

// A Night's repeat (ADR-0014): every 1 or 2 weeks on the Night's weekday, or
// monthly on the Nth (1–4) or last (-1) of that weekday. null is a one-off.
// The backend opens the next Night when a repeating one is recorded or
// cancelled; the dates after it are only projected here (seriesDates).
export type MonthWeek = 1 | 2 | 3 | 4 | -1;
export type Repeat =
  | { freq: "weekly"; intervalWeeks: 1 | 2 }
  | { freq: "monthly"; week: MonthWeek };

// parseRepeat validates an untrusted repeat payload: null for a one-off, else
// a weekly or monthly rule. Throws on anything else.
export function parseRepeat(raw: unknown): Repeat | null {
  if (raw === null) {
    return null;
  }
  if (typeof raw !== "object") {
    throw new Error("repeat: expected an object or null");
  }
  const { freq, intervalWeeks, week } = raw as Record<string, unknown>;
  if (freq === "weekly") {
    if (intervalWeeks !== 1 && intervalWeeks !== 2) {
      throw new Error("repeat: weekly intervalWeeks must be 1 or 2");
    }
    return { freq, intervalWeeks };
  }
  if (freq === "monthly") {
    if (week !== 1 && week !== 2 && week !== 3 && week !== 4 && week !== -1) {
      throw new Error("repeat: monthly week must be 1–4 or -1");
    }
    return { freq, week };
  }
  throw new Error('repeat: freq must be "weekly" or "monthly"');
}

// sameRepeat compares two repeats by value; null is a one-off. Pure.
export function sameRepeat(a: Repeat | null, b: Repeat | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (a.freq === "weekly" && b.freq === "weekly") {
    return a.intervalWeeks === b.intervalWeeks;
  }
  if (a.freq === "monthly" && b.freq === "monthly") {
    return a.week === b.week;
  }
  return false;
}

// Dates are zone-less YYYY-MM-DD (ADR-0011), so the math runs on UTC
// midnights, where every day is 24 hours and DST never applies.
function toUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

// weekdayInMonth is the week-th weekday wd of month m (0-based; Date.UTC
// normalizes one past December), or its last for -1. Pure.
function weekdayInMonth(y: number, m: number, wd: number, week: MonthWeek): Date {
  if (week === -1) {
    const end = new Date(Date.UTC(y, m + 1, 0));
    return new Date(Date.UTC(y, m + 1, 0 - ((end.getUTCDay() - wd + 7) % 7)));
  }
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return new Date(Date.UTC(y, m, 1 + ((wd - first + 7) % 7) + 7 * (week - 1)));
}

// matchesWeek is whether date falls on the monthly week (its Nth, or last, of
// its weekday). Pure.
function matchesWeek(date: string, week: MonthWeek): boolean {
  const dt = toUTC(date);
  return toISO(weekdayInMonth(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDay(), week)) === date;
}

// monthWeekOf is the monthly week a date falls in: its Nth weekday of the
// month, with a 5th weekday as the last, which every month has. Pure.
function monthWeekOf(date: string): MonthWeek {
  const n = Math.ceil(toUTC(date).getUTCDate() / 7);
  return n >= 5 ? -1 : (n as MonthWeek);
}

// reconcileRepeat keeps a rule in step with the Night's date as it moves: a
// weekly rule follows any date, and a monthly one keeps its week while the
// date still falls on it, else takes the date's own week. Pure.
export function reconcileRepeat(repeat: Repeat | null, date: string): Repeat | null {
  if (repeat === null || repeat.freq === "weekly" || matchesWeek(date, repeat.week)) {
    return repeat;
  }
  return { freq: "monthly", week: monthWeekOf(date) };
}

const ORDINALS: Record<MonthWeek, string> = { 1: "First", 2: "Second", 3: "Third", 4: "Fourth", [-1]: "Last" };

// formatRepeatLabel names a rule for a Night on date: "Every Friday", "Every
// 2 weeks", "Third Friday of the month", or "Doesn't repeat". Pure.
export function formatRepeatLabel(repeat: Repeat | null, date: string): string {
  if (repeat === null) {
    return "Doesn't repeat";
  }
  if (repeat.freq === "weekly") {
    return repeat.intervalWeeks === 1 ? `Every ${weekday(date, true)}` : "Every 2 weeks";
  }
  return `${ORDINALS[repeat.week]} ${weekday(date, true)} of the month`;
}

// formatRepeatShort is the cadence alone ("Weekly", "Every 2 weeks",
// "Monthly"), for a line that already shows the date, such as the
// UpNextCard's. Pure.
export function formatRepeatShort(repeat: Repeat): string {
  if (repeat.freq === "monthly") {
    return "Monthly";
  }
  return repeat.intervalWeeks === 1 ? "Weekly" : "Every 2 weeks";
}

export type RepeatOption = { id: string; label: string; note: string; repeat: Repeat | null };

// repeatOptions is the Repeat screen's four choices for a Night on date. The
// monthly one keeps the current week while it still matches the date, so a
// 4th Friday that is also the last stays "Last" once chosen. Pure.
export function repeatOptions(date: string, current: Repeat | null): RepeatOption[] {
  const days = `${weekday(date, true)}s`;
  const week = current?.freq === "monthly" && matchesWeek(date, current.week) ? current.week : monthWeekOf(date);
  return [
    { id: "none", label: "Doesn't repeat", note: "A one-off night", repeat: null },
    { id: "weekly-1", label: "Every week", note: days, repeat: { freq: "weekly", intervalWeeks: 1 } },
    { id: "weekly-2", label: "Every 2 weeks", note: days, repeat: { freq: "weekly", intervalWeeks: 2 } },
    { id: "monthly", label: "Every month", note: `${ORDINALS[week]} ${weekday(date, true)}`, repeat: { freq: "monthly", week } },
  ];
}

// nextDate is the rule's first date after date, on date's weekday. Pure.
function nextDate(repeat: Repeat, date: string): string {
  const dt = toUTC(date);
  if (repeat.freq === "weekly") {
    return toISO(new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 7 * repeat.intervalWeeks)));
  }
  return toISO(weekdayInMonth(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDay(), repeat.week));
}

// seriesDates previews a series: the Night's own date, then the next count-1
// dates the rule gives. They're projections; the backend opens each Night
// only when the one before it is recorded or cancelled. A one-off is just its
// date. Pure.
export function seriesDates(repeat: Repeat | null, date: string, count: number): string[] {
  if (repeat === null) {
    return [date];
  }
  const out = [date];
  while (out.length < count) {
    out.push(nextDate(repeat, out[out.length - 1]));
  }
  return out;
}
