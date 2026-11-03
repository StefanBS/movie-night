import { test } from "node:test";
import assert from "node:assert/strict";

import { buildHistoryMonths, watchedOn, watchedSub } from "./history";
import type { Night } from "./nights";

function night(id: string, scheduledFor: string, tmdbId: number | null): Night {
  return {
    id,
    scheduledFor,
    startTime: null,
    pickerId: "u1",
    reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
    movie:
      tmdbId === null
        ? null
        : { tmdbId, title: `Film ${tmdbId}`, releaseYear: null, posterUrl: null },
    attendees: [],
  };
}

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

const TODAY = "2026-06-22";

const watchedCases: [string, Night[], [number, string][]][] = [
  ["no nights", [], []],
  ["a past night's film, with its date", [night("a", "2026-05-02", 10)], [[10, "2026-05-02"]]],
  ["tonight's film counts as watched", [night("a", TODAY, 10)], [[10, TODAY]]],
  ["an upcoming night's film doesn't", [night("a", "2026-06-26", 10)], []],
  ["a night without a film adds nothing", [night("a", "2026-05-02", null)], []],
  ["the night being edited is left out", [night("self", "2026-05-02", 10)], []],
  [
    "a film watched twice keeps the later date, in any order",
    [night("a", "2026-03-06", 10), night("b", "2026-05-02", 10), night("c", "2026-04-10", 10)],
    [[10, "2026-05-02"]],
  ],
];
for (const [name, nights, want] of watchedCases) {
  test(`watchedOn: ${name}`, () => {
    assert.deepEqual([...watchedOn(nights, "self", TODAY)], want);
  });
}

for (const [name, count, since, want] of [
  ["many nights", 11, "2025-09-12", "11 nights since Sep 12 2025."],
  ["one night is singular", 1, "2026-01-03", "1 night since Jan 3 2026."],
] as const) {
  test(`watchedSub: ${name}`, () => {
    assert.equal(watchedSub(count, since), want);
  });
}
