import { formatMonthYear, todayLocalISO } from "./date";
import { historyNights } from "./nightLifecycle";
import type { Night } from "./nights";

export type HistoryStats = { nights: number; films: number };
export type HistoryMonth = { label: string; nights: Night[] };

// historyStats summarizes recorded nights for the History stat strip. `films`
// counts distinct movies (by tmdbId), so a film watched twice counts once and a
// movie-less night counts toward `nights` only.
export function historyStats(nights: Night[]): HistoryStats {
  const tmdbIds = new Set<number>();
  for (const n of nights) {
    if (n.movie !== null) {
      tmdbIds.add(n.movie.tmdbId);
    }
  }
  return {
    nights: nights.length,
    films: tmdbIds.size,
  };
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
