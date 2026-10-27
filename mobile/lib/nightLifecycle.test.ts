import { test } from "node:test";
import assert from "node:assert/strict";

import { historyNights, nightDates, nightTiming, upNext, type NightTiming } from "./nightLifecycle";
import type { Night } from "./nights";

const TODAY = "2026-06-22";
const aMovie = { tmdbId: 1, title: "Dune", releaseYear: 2021, posterUrl: "https://img/x.jpg" };

function night(id: string, scheduledFor: string, opts: Partial<Night> = {}): Night {
  return {
    id,
    scheduledFor,
    pickerId: "u1",
    movie: null,
    attendees: [],
    reminders: { nightBefore: true, morningOf: true, audience: "everyone" },
    ...opts,
  };
}

const ids = (ns: Night[]) => ns.map((n) => n.id);

// nightTiming

const timingCases: [string, string, NightTiming][] = [
  ["tomorrow", "2026-06-23", "upcoming"],
  ["next year", "2027-01-01", "upcoming"],
  ["today", TODAY, "tonight"],
  ["yesterday", "2026-06-21", "past"],
  ["last month", "2026-05-30", "past"],
];
for (const [name, date, want] of timingCases) {
  test(`nightTiming: ${name} → ${want}`, () => {
    assert.equal(nightTiming(date, TODAY), want);
  });
}

// upNext

const upNextCases: [string, Night[], string | null][] = [
  ["no nights", [], null],
  ["only past nights", [night("p", "2026-06-20")], null],
  ["tonight without a film", [night("t", TODAY)], "t"],
  ["tonight with a film stays up next", [night("t", TODAY, { movie: aMovie })], "t"],
  ["an upcoming night with a film", [night("u", "2026-06-26", { movie: aMovie })], "u"],
  [
    "the soonest of several",
    [night("far", "2026-07-10"), night("soon", "2026-06-26"), night("mid", "2026-06-30")],
    "soon",
  ],
  ["tonight beats upcoming", [night("u", "2026-06-23"), night("t", TODAY)], "t"],
  ["skips past, keeps upcoming", [night("p", "2026-06-10", { movie: aMovie }), night("u", "2026-07-01")], "u"],
];
for (const [name, nights, want] of upNextCases) {
  test(`upNext: ${name}`, () => {
    assert.equal(upNext(nights, TODAY)?.id ?? null, want);
  });
}

// historyNights

const historyCases: [string, Night[], string[]][] = [
  ["no nights", [], []],
  ["past nights, in the given order", [night("b", "2026-06-15"), night("a", "2026-06-01")], ["b", "a"]],
  ["tonight is included", [night("t", TODAY)], ["t"]],
  ["a past night with no film still counts", [night("p", "2026-06-15")], ["p"]],
  ["upcoming nights are excluded", [night("u", "2026-06-23"), night("p", "2026-06-15")], ["p"]],
];
for (const [name, nights, want] of historyCases) {
  test(`historyNights: ${name}`, () => {
    assert.deepEqual(ids(historyNights(nights, TODAY)), want);
  });
}

test("tonight's Night is in both Up next and History", () => {
  const nights = [night("t", TODAY), night("p", "2026-06-15"), night("u", "2026-06-29")];
  assert.equal(upNext(nights, TODAY)?.id, "t");
  assert.deepEqual(ids(historyNights(nights, TODAY)), ["t", "p"]);
});

// nightDates

test("nightDates: empty list → empty set", () => {
  assert.equal(nightDates([]).size, 0);
});

test("nightDates: one entry per dated night, past and upcoming", () => {
  const set = nightDates([night("a", "2026-06-19"), night("b", "2026-06-26")]);
  assert.deepEqual([...set].sort(), ["2026-06-19", "2026-06-26"]);
});
