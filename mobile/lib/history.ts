import { formatMonthYear, formatShortDateYear, todayLocalISO } from "./date";
import { historyNights } from "./nightLifecycle";
import type { Night } from "./nights";

export type HistoryMonth = { label: string; nights: Night[] };

// watchedSub is the Watched tab bar's sub: how many nights the group has
// recorded and since when ("11 nights since Sep 12 2025."). `since` is the
// group's creation date (YYYY-MM-DD).
export function watchedSub(count: number, since: string): string {
  const nights = count === 1 ? "night" : "nights";
  return `${count} ${nights} since ${formatShortDateYear(since)}.`;
}

// buildHistoryMonths groups nights into month buckets for the History list,
// newest month first and newest night first within each bucket. The label is the
// month of scheduledFor ("Jun 2026"). Sorting compares the YYYY-MM-DD strings
// directly — fixed-width ISO sorts chronologically as plain text, so there is no
// Date parsing and the result stays timezone-independent (like date.ts).
export function buildHistoryMonths(nights: Night[]): HistoryMonth[] {
  const sorted = [...nights].sort((a, b) =>
    b.scheduledFor.localeCompare(a.scheduledFor),
  );
  const months: HistoryMonth[] = [];
  for (const n of sorted) {
    const label = formatMonthYear(n.scheduledFor);
    const last = months[months.length - 1];
    if (last !== undefined && last.label === label) {
      last.nights.push(n);
    } else {
      months.push({ label, nights: [n] });
    }
  }
  return months;
}

// watchedOn maps each film the group has already watched (by tmdbId) to the
// last date they watched it, for "watched May 2" in the film search. Watched
// means a Night dated today or earlier, as in History; `exceptNightId` leaves
// out the Night whose film is being chosen, so its own film doesn't count.
export function watchedOn(
  nights: Night[],
  exceptNightId: string,
  today: string = todayLocalISO(),
): Map<number, string> {
  const watched = new Map<number, string>();
  for (const n of historyNights(nights, today)) {
    if (n.id === exceptNightId || n.movie === null) continue;
    const last = watched.get(n.movie.tmdbId);
    if (last === undefined || n.scheduledFor > last) {
      watched.set(n.movie.tmdbId, n.scheduledFor);
    }
  }
  return watched;
}
