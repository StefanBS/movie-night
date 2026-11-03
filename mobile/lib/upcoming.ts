import { firstName } from "./avatar";
import { countdownLabel, formatStartTime, formatWeekdayDate, todayLocalISO } from "./date";
import type { Night } from "./nights";

// What the Upcoming tab says about the Nights on the calendar. Pure, so the
// screen only lays it out. `today` and `locale` are injectable for tests.

// upcomingSub is the tab bar's sub: how far off the next Night is ("Next in 4
// days."), or "Nothing planned yet." with none.
export function upcomingSub(next: Night | null, today: string = todayLocalISO()): string {
  if (next === null) {
    return "Nothing planned yet.";
  }
  return `Next ${countdownLabel(next.scheduledFor, today)}.`;
}

// upcomingTitle is a row's title: the full date, then the start time when set
// ("Friday, Jun 19 · 8:00 PM").
export function upcomingTitle(night: Night, locale?: string): string {
  const date = formatWeekdayDate(night.scheduledFor);
  return night.startTime === null ? date : `${date} · ${formatStartTime(night.startTime, locale)}`;
}

// upcomingPicker is the Night's picker among its attendees, or null if the
// payload somehow lacks them (every Night has one, ADR-0008).
export function upcomingPicker(night: Night): { id: string; name: string } | null {
  return night.attendees.find((a) => a.id === night.pickerId) ?? null;
}

// upcomingMeta is a row's line under the date: who picks and how many are
// coming ("Ada picks · 3 coming").
export function upcomingMeta(night: Night): string {
  const coming = `${night.attendees.length} coming`;
  const picker = upcomingPicker(night);
  return picker === null ? coming : `${firstName(picker.name)} picks · ${coming}`;
}
