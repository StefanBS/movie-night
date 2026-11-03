import { test } from "node:test";
import assert from "node:assert/strict";

import type { Night } from "./nights";
import { upcomingMeta, upcomingSub, upcomingTitle } from "./upcoming";

const TODAY = "2026-06-15";

function night(scheduledFor: string, opts: Partial<Night> = {}): Night {
  return {
    id: "n",
    scheduledFor,
    startTime: null,
    pickerId: "a",
    movie: null,
    attendees: [
      { id: "a", name: "Ada Lovelace", role: "core" },
      { id: "b", name: "Bo", role: "core" },
      { id: "g", name: "Gus", role: "guest" },
    ],
    reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
    ...opts,
  };
}

const subCases: [string, Night | null, string][] = [
  ["nothing planned", null, "Nothing planned yet."],
  ["tonight", night(TODAY), "Next tonight."],
  ["tomorrow", night("2026-06-16"), "Next tomorrow."],
  ["in a few days", night("2026-06-19"), "Next in 4 days."],
];
for (const [name, next, want] of subCases) {
  test(`upcomingSub: ${name}`, () => {
    assert.equal(upcomingSub(next, TODAY), want);
  });
}

const titleCases: [string, Night, string][] = [
  ["no start time", night("2026-06-19"), "Friday, Jun 19"],
  ["with a start time", night("2026-06-19", { startTime: "20:00" }), "Friday, Jun 19 · 8:00 PM"],
];
for (const [name, n, want] of titleCases) {
  test(`upcomingTitle: ${name}`, () => {
    assert.equal(upcomingTitle(n, "en-US"), want);
  });
}

const metaCases: [string, Night, string][] = [
  ["picker and count", night("2026-06-19"), "Ada picks · 3 coming"],
  ["picker missing from the attendees", night("2026-06-19", { pickerId: "zzz" }), "3 coming"],
];
for (const [name, n, want] of metaCases) {
  test(`upcomingMeta: ${name}`, () => {
    assert.equal(upcomingMeta(n), want);
  });
}
