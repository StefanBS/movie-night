import { firstName } from "./avatar";
import type { Night } from "./nights";

// A Night has no time of day, so a Calendar entry gets this default evening;
// the person can change it in the OS form before saving.
const START_HOUR = 19;
const START_MINUTE = 30;
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
// 7:30 PM is 7:30 PM on the phone that saves it. Pure.
export function calendarEntry(night: Night): CalendarEntry {
  const picker = night.attendees.find((a) => a.id === night.pickerId);
  const pickerName = firstName(picker?.name ?? "");
  const url = `movienight://night/${night.id}`;

  const lines = [`Coming: ${night.attendees.map((a) => a.name).join(", ")}`];
  if (night.movie !== null) {
    const year = night.movie.releaseYear !== null ? ` (${night.movie.releaseYear})` : "";
    lines.push(`Film: ${night.movie.title}${year}`);
  }
  lines.push(url);

  const [year, month, day] = night.scheduledFor.split("-").map(Number);
  return {
    title: pickerName !== "" ? `🎬 Movie Night — ${pickerName} picks` : "🎬 Movie Night",
    notes: lines.join("\n"),
    url,
    startDate: new Date(year, month - 1, day, START_HOUR, START_MINUTE),
    endDate: new Date(year, month - 1, day, START_HOUR + DURATION_HOURS, START_MINUTE),
  };
}
