import { test } from "node:test";
import assert from "node:assert/strict";

import type { Night } from "./nights";
import { alsoPlannedPicks } from "./alsoPlanned";

function night(opts: Partial<Night> = {}): Night {
  return {
    id: "n",
    scheduledFor: "2026-06-27",
    startTime: null,
    pickerId: "p",
    movie: null,
    attendees: [
      { id: "a", name: "Ada Lovelace" },
      { id: "p", name: "Priya Raman" },
    ],
    reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
    watchedAt: null,
    repeat: null,
    ...opts,
  };
}

const picksCases: [string, Night, string][] = [
  ["the picker's first name", night(), "Priya picks"],
];
for (const [name, n, want] of picksCases) {
  test(`alsoPlannedPicks: ${name}`, () => {
    assert.equal(alsoPlannedPicks(n), want);
  });
}
