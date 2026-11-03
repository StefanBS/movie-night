import { firstName } from "./avatar";
import { nightPicker, type Night } from "./nights";
import { formatRepeatLabel, type Repeat } from "./repeat";

// A Calendar entry starts at the Night's start time, or this default evening
// when it has none (ADR-0011), and runs DURATION_HOURS; the person can change
// either in the OS form before saving.
const DEFAULT_START = "19:30";
const DURATION_HOURS = 3;

export type CalendarEntry = {
  title: string;
  notes: string;
  url: string;
  startDate: Date;
  endDate: Date;
};

// calendarEntry builds the one-off copy of a Night handed to the OS calendar
// form: who picks, who's coming, the film if chosen, and a link back to the
// Night. Times are local wall-clock (numeric Date args, like lib/date.ts), so
// 7:30 PM is 7:30 PM on the phone that saves it; a late start's end rolls into
// the next day. Pure.
export function calendarEntry(night: Night): CalendarEntry {
  const pickerName = firstName(nightPicker(night)?.name ?? "");
  const url = `movienight://night/${night.id}`;

  const lines = [`Coming: ${night.attendees.map((a) => a.name).join(", ")}`];
  if (night.movie !== null) {
    const year = night.movie.releaseYear !== null ? ` (${night.movie.releaseYear})` : "";
    lines.push(`Film: ${night.movie.title}${year}`);
  }
  lines.push(url);

  const [year, month, day] = night.scheduledFor.split("-").map(Number);
  const [hour, minute] = (night.startTime ?? DEFAULT_START).split(":").map(Number);
  return {
    title: pickerName !== "" ? `🎬 Movie Night — ${pickerName} picks` : "🎬 Movie Night",
    notes: lines.join("\n"),
    url,
    startDate: new Date(year, month - 1, day, hour, minute),
    endDate: new Date(year, month - 1, day, hour + DURATION_HOURS, minute),
  };
}

// CalendarRecurrence is the calendar rule for a Night's whole series: every
// `interval` weeks, on the start date's weekday, with no end. The app's
// series runs until someone sets "Doesn't repeat", and like a one-off entry
// the calendar copy doesn't follow later changes, so the person ends it in
// their calendar.
export type CalendarRecurrence = { interval: 1 | 2 };

// calendarRecurrence is the calendar rule for a Night's series, or null when
// it can only be added as the one night: a one-off, or a monthly repeat.
// expo-calendar (SDK 58) can't pass a monthly "Nth weekday" rule to the OS
// form: Android's form gets only FREQ and INTERVAL (no BYDAY), so it would
// recur on the same day of the month, and iOS numbers the weekdays from
// Monday where the JS enum starts at Sunday, so it would land a day late.
// Pure.
export function calendarRecurrence(repeat: Repeat | null): CalendarRecurrence | null {
  return repeat?.freq === "weekly" ? { interval: repeat.intervalWeeks } : null;
}

// seriesNote is the cadence for the middle of a sentence ("every Friday",
// "every 2 weeks"), from the Repeat label with its first letter lowered.
// Pure.
export function seriesNote(repeat: Repeat, date: string): string {
  const label = formatRepeatLabel(repeat, date);
  return label.charAt(0).toLowerCase() + label.slice(1);
}
