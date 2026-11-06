import { test } from "node:test";
import assert from "node:assert/strict";

import { buildHistory, watchedSub } from "./history";
import type { Night } from "./nights";

// night is a Night recorded as watched.
function night(id: string, scheduledFor: string): Night {
  return {
    id,
    scheduledFor,
    startTime: null,
    pickerId: "u1",
    reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
    movie: { tmdbId: 1, title: "Film", releaseYear: null, posterUrl: null, genres: [], runtimeMinutes: null },
    attendees: [],
    watchedAt: `${scheduledFor}T22:00:00Z`,
    repeat: null,
  };
}

const historyCases: [string, string[], [string | null, string[]][]][] = [
  [
    "this year's nights are one unlabelled run, newest first across months",
    ["2026-05-02", "2026-06-20", "2026-06-05"],
    [[null, ["2026-06-20", "2026-06-05", "2026-05-02"]]],
  ],
  [
    "an earlier year gets its own labelled section",
    ["2025-11-14", "2026-01-09", "2025-12-12"],
    [
      [null, ["2026-01-09"]],
      ["2025", ["2025-12-12", "2025-11-14"]],
    ],
  ],
  [
    "each earlier year is labelled, even with no nights this year",
    ["2024-12-06", "2025-03-07"],
    [
      ["2025", ["2025-03-07"]],
      ["2024", ["2024-12-06"]],
    ],
  ],
];
for (const [name, dates, want] of historyCases) {
  test(`buildHistory: ${name}`, () => {
    const sections = buildHistory(dates.map((d) => night(d, d)), "2026-11-03");
    assert.deepEqual(
      sections.map((s) => [s.label, s.nights.map((n) => n.id)]),
      want,
    );
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
