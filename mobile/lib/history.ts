import { formatMonthYear } from "./date";
import type { Night } from "./nights";

export type HistoryStats = { nights: number; films: number; loved: number };
export type HistoryMonth = { label: string; nights: Night[] };

// historyStats summarizes recorded nights for the History stat strip. `films`
// counts distinct movies (by tmdbId), so a film watched twice counts once and a
// movie-less night counts toward `nights` only. `loved` is 0 until reactions
// land — the Night model has no reaction field yet.
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
    loved: 0, // TODO(#40): count nights whose reaction === "loved"
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
