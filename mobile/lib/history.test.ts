import { test } from "node:test";
import assert from "node:assert/strict";

import { buildHistoryMonths, historyStats } from "./history";
import type { Night } from "./nights";

function night(id: string, scheduledFor: string, tmdbId: number | null): Night {
  return {
    id,
    scheduledFor,
    pickerId: null,
    movie:
      tmdbId === null
        ? null
        : { tmdbId, title: `Film ${tmdbId}`, releaseYear: null, posterUrl: null },
    attendees: [],
  };
}

test("historyStats counts nights, distinct films, and zero loved", () => {
  const nights = [
    night("a", "2026-06-12", 10),
    night("b", "2026-05-30", 20),
    night("c", "2026-05-02", 10), // same film as a → not a distinct film
  ];
  assert.deepEqual(historyStats(nights), { nights: 3, films: 2, loved: 0 });
});

test("historyStats counts a movie-less night but not as a film", () => {
  const nights = [night("a", "2026-06-12", 10), night("b", "2026-06-01", null)];
  assert.deepEqual(historyStats(nights), { nights: 2, films: 1, loved: 0 });
});

test("historyStats on an empty list is all zeros", () => {
  assert.deepEqual(historyStats([]), { nights: 0, films: 0, loved: 0 });
});

test("buildHistoryMonths groups by month, newest first within and across", () => {
  const nights = [
    night("old", "2026-05-02", 1),
    night("newest", "2026-06-20", 2),
    night("mid", "2026-06-05", 3),
  ];
  const months = buildHistoryMonths(nights);
  assert.deepEqual(months.map((m) => m.label), ["Jun 2026", "May 2026"]);
  assert.deepEqual(months[0].nights.map((n) => n.id), ["newest", "mid"]);
  assert.deepEqual(months[1].nights.map((n) => n.id), ["old"]);
});

test("buildHistoryMonths on an empty list is empty", () => {
  assert.deepEqual(buildHistoryMonths([]), []);
});
