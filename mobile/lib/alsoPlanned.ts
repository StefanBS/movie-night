import { firstName } from "./avatar";
import { formatStartTime, formatWeekdayDayMonth } from "./date";
import { nightPicker, type Night } from "./nights";

// What a row in Tonight's "Also planned" says. Pure, so the
// screen only lays it out. `locale` is injectable for tests.

// alsoPlannedWhen is a row's title: the compact date, then the start time
// when set ("Sat 27 Jun · 8:00 PM").
export function alsoPlannedWhen(night: Night, locale?: string): string {
  const date = formatWeekdayDayMonth(night.scheduledFor);
  return night.startTime === null ? date : `${date} · ${formatStartTime(night.startTime, locale)}`;
}

// alsoPlannedPicks is a row's line under the date ("Priya picks"), or null
// when the picker is missing from the attendees.
export function alsoPlannedPicks(night: Night): string | null {
  const picker = nightPicker(night);
  return picker === null ? null : `${firstName(picker.name)} picks`;
}
