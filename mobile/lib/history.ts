import { formatShortDateYear, todayLocalISO } from "./date";
import type { Night } from "./nights";

// A HistorySection is a run of Watched rows under one year label, or under
// none (label null) for the current year. `data` is SectionList's field name,
// so the sections render as they are.
export type HistorySection = { label: string | null; data: Night[] };

// watchedSub is the Watched tab bar's sub: how many nights the group has
// recorded and since when ("11 nights since Sep 12 2025."). `since` is the
// group's creation date (YYYY-MM-DD).
export function watchedSub(count: number, since: string): string {
  const nights = count === 1 ? "night" : "nights";
  return `${count} ${nights} since ${formatShortDateYear(since)}.`;
}

// buildHistory lays out the Watched list: one continuous run of nights, newest
// first. Rows carry their own date, so months get no headers; only a year
// earlier than `today`'s gets a section label ("2025"), and the current year's
// section has label null. Sorting compares the YYYY-MM-DD strings directly:
// fixed-width ISO sorts chronologically as plain text, so there is no Date
// parsing and the result stays timezone-independent (like date.ts).
export function buildHistory(
  nights: Night[],
  today: string = todayLocalISO(),
): HistorySection[] {
  const thisYear = today.slice(0, 4);
  const sorted = [...nights].sort((a, b) =>
    b.scheduledFor.localeCompare(a.scheduledFor),
  );
  const sections: HistorySection[] = [];
  for (const n of sorted) {
    const year = n.scheduledFor.slice(0, 4);
    const label = year < thisYear ? year : null;
    const last = sections[sections.length - 1];
    if (last !== undefined && last.label === label) {
      last.data.push(n);
    } else {
      sections.push({ label, data: [n] });
    }
  }
  return sections;
}
