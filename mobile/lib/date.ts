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
