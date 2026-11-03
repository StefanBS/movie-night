import { test } from "node:test";
import assert from "node:assert/strict";

import type { Night } from "./nights";
import { alsoPlannedPicks, alsoPlannedWhen } from "./alsoPlanned";

function night(opts: Partial<Night> = {}): Night {
  return {
    id: "n",
    scheduledFor: "2026-06-27",
    startTime: null,
    pickerId: "p",
    movie: null,
    attendees: [
      { id: "a", name: "Ada Lovelace", role: "core" },
      { id: "p", name: "Priya Raman", role: "core" },
    ],
    reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
    watchedAt: null,
    repeat: null,
    ...opts,
  };
}

const whenCases: [string, Night, string][] = [
  ["date only without a start time", night(), "Sat 27 Jun"],
  ["date and start time", night({ startTime: "20:00" }), "Sat 27 Jun · 8:00 PM"],
];
for (const [name, n, want] of whenCases) {
  test(`alsoPlannedWhen: ${name}`, () => {
    assert.equal(alsoPlannedWhen(n, "en-US"), want);
  });
}

test("alsoPlannedWhen: a 24-hour locale keeps HH:MM", () => {
  assert.equal(alsoPlannedWhen(night({ startTime: "20:00" }), "en-GB"), "Sat 27 Jun · 20:00");
});

const picksCases: [string, Night, string | null][] = [
  ["the picker's first name", night(), "Priya picks"],
  ["picker missing from the attendees", night({ pickerId: "zzz" }), null],
];
for (const [name, n, want] of picksCases) {
  test(`alsoPlannedPicks: ${name}`, () => {
    assert.equal(alsoPlannedPicks(n), want);
  });
}
