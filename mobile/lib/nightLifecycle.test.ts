import { test } from "node:test";
import assert from "node:assert/strict";

import { historyNights, nightDates, nightMeta, nightTiming, nightWording, upcomingNights, upNext, type NightTiming } from "./nightLifecycle";
import type { Night } from "./nights";

const TODAY = "2026-06-22";
const aMovie = { tmdbId: 1, title: "Dune", releaseYear: 2021, posterUrl: "https://img/x.jpg", genres: [], runtimeMinutes: null };

function night(id: string, scheduledFor: string, opts: Partial<Night> = {}): Night {
  return {
    id,
    scheduledFor,
    startTime: null,
    pickerId: "u1",
    movie: null,
    attendees: [],
    reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
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

// nightWording: what each screen says for a Night's timing. One row per timing,
// with an upcoming date three days out so the countdown has a day count.

const UPCOMING = "2026-06-25";
const PAST = "2026-06-20";

const countdownCases: [string, string | null][] = [
  [UPCOMING, "in 3 days"],
  [TODAY, "tonight"],
  [PAST, null],
];
for (const [date, want] of countdownCases) {
  test(`nightWording: countdown for ${date} → ${want}`, () => {
    assert.equal(nightWording(date, TODAY).countdown, want);
  });
}

const pickerTitleCases: [string, string][] = [
  [UPCOMING, "Ana picks"],
  [TODAY, "Ana picks"],
  [PAST, "Ana"],
];
for (const [date, want] of pickerTitleCases) {
  test(`nightWording: picker title for ${date} → ${want}`, () => {
    assert.equal(nightWording(date, TODAY).pickerTitle("Ana"), want);
  });
}

const attendeesCases: [string, string][] = [
  [UPCOMING, "Coming · 4"],
  [TODAY, "Coming · 4"],
  [PAST, "Who watched · 4"],
];
for (const [date, want] of attendeesCases) {
  test(`nightWording: attendees heading for ${date} → ${want}`, () => {
    assert.equal(nightWording(date, TODAY).attendeesSection(4), want);
  });
}

const whoCases: [string, { section: string; hint: string }][] = [
  [UPCOMING, { section: "Who's coming?", hint: "Who's planning to come? The next-up member who's in gets the pick." }],
  [TODAY, { section: "Who's here?", hint: "Tap who made it. Tonight's pick goes to whoever's next up and here." }],
  [PAST, { section: "Who was there?", hint: "Tap who made it. The pick goes to whoever was next up and there." }],
];
for (const [date, want] of whoCases) {
  test(`nightWording: the Who step for ${date}`, () => {
    const w = nightWording(date, TODAY);
    assert.deepEqual({ section: w.whoSection, hint: w.whoHint }, want);
  });
}

const nightScreenCases: [string, { note: string | null; edit: string; skip: string }][] = [
  [
    UPCOMING,
    {
      note: "Ana can choose now or on the night. Whatever it is, you watch it.",
      edit: "Date, time and who's coming",
      skip: "Skip for now · Ana can pick later",
    },
  ],
  [
    TODAY,
    {
      note: "Ana can choose now or later tonight. Whatever it is, you watch it.",
      edit: "Date, time and who's coming",
      skip: "Skip for now · Ana can pick later",
    },
  ],
  [PAST, { note: null, edit: "Date, time and who watched", skip: "Skip for now" }],
];
for (const [date, want] of nightScreenCases) {
  test(`nightWording: Night screen and pick lines for ${date}`, () => {
    const w = nightWording(date, TODAY);
    assert.deepEqual(
      { note: w.pickerNote === null ? null : w.pickerNote("Ana"), edit: w.editSub, skip: w.skipLabel("Ana") },
      want,
    );
  });
}

const calendarCases: [string, boolean][] = [
  [UPCOMING, true],
  [TODAY, true],
  [PAST, false],
];
for (const [date, want] of calendarCases) {
  test(`nightWording: calendar entry for ${date}`, () => {
    assert.equal(nightWording(date, TODAY).canAddToCalendar, want);
  });
}

// TODAY is a Monday; UPCOMING is the Thursday three days out.
const metaCases: [string, string, string | null, string][] = [
  ["upcoming with a start time", UPCOMING, "20:00", "This Thursday · Jun 25 · 8:00 PM"],
  ["upcoming without a start time", UPCOMING, null, "This Thursday · Jun 25"],
  ["tonight", TODAY, "19:30", "Tonight · Jun 22 · 7:30 PM"],
  ["past: the full date, never the time", PAST, "20:00", "Saturday, Jun 20"],
];
for (const [name, date, startTime, want] of metaCases) {
  test(`nightMeta: ${name}`, () => {
    assert.equal(nightMeta(date, startTime, TODAY, "en-US"), want);
  });
}

// upcomingNights

const upcomingCases: [string, Night[], string[]][] = [
  ["no nights", [], []],
  ["only past nights", [night("p", "2026-06-20")], []],
  [
    "tonight and later, soonest first",
    [night("far", "2026-07-10"), night("p", "2026-06-01"), night("t", TODAY), night("soon", "2026-06-26")],
    ["t", "soon", "far"],
  ],
];
for (const [name, nights, want] of upcomingCases) {
  test(`upcomingNights: ${name}`, () => {
    assert.deepEqual(ids(upcomingNights(nights, TODAY)), want);
  });
}
