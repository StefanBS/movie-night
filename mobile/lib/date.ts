// todayLocalISO returns the given date (default: now) as a device-local
// YYYY-MM-DD string — the "tonight" a phone user means, independent of the
// server clock or UTC. The optional `now` argument keeps it pure and testable.
export function todayLocalISO(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// formatShortDate turns a YYYY-MM-DD string into a short "May 30" label. It
// splits the ISO string by hand (no Date parsing) so it stays timezone-
// independent, like todayLocalISO. The day is not zero-padded.
export function formatShortDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${SHORT_MONTHS[month - 1]} ${day}`;
}

// formatMonthYear turns a YYYY-MM-DD string into a "Jun 2024" label. Like
// formatShortDate, it splits the ISO string by hand so it stays timezone-
// independent. Used for the member profile's "since" line.
export function formatMonthYear(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return `${SHORT_MONTHS[month - 1]} ${year}`;
}

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
