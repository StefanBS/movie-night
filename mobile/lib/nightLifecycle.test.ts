import { test } from "node:test";
import assert from "node:assert/strict";

import { watchedNights, isDue, nightDates, nightMeta, nightTiming, nightWording, plannedNights, upNextAction, type NightTiming, type UpNextAction } from "./nightLifecycle";
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
    watchedAt: null,
    repeat: null,
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

// isDue: a Night waiting to be recorded, dated today or earlier.

const WATCHED = { watchedAt: "2026-06-20T22:00:00Z" };

const dueCases: [string, Night, boolean][] = [
  ["tomorrow, not watched", night("u", "2026-06-23"), false],
  ["today, not watched", night("t", TODAY), true],
  ["yesterday, not watched", night("p", "2026-06-21"), true],
  ["today, already watched", night("t", TODAY, WATCHED), false],
  ["yesterday, already watched", night("p", "2026-06-21", WATCHED), false],
];
for (const [name, n, want] of dueCases) {
  test(`isDue: ${name} → ${want}`, () => {
    assert.equal(isDue(n, TODAY), want);
  });
}

// upNextAction: the UpNextCard's primary button, the next thing to do.

const actionCases: [string, Night, UpNextAction][] = [
  ["no film, tomorrow", night("u", "2026-06-23"), "chooseFilm"],
  ["no film, today", night("t", TODAY), "chooseFilm"],
  ["no film, yesterday", night("p", "2026-06-21"), "chooseFilm"],
  ["film, tomorrow", night("u", "2026-06-23", { movie: aMovie }), null],
  ["film, today", night("t", TODAY, { movie: aMovie }), "watched"],
  ["film, yesterday, not recorded", night("p", "2026-06-21", { movie: aMovie }), "watched"],
  ["film, yesterday, already recorded", night("p", "2026-06-21", { movie: aMovie, ...WATCHED }), null],
];
for (const [name, n, want] of actionCases) {
  test(`upNextAction: ${name} → ${want}`, () => {
    assert.equal(upNextAction(n, TODAY), want);
  });
}

// watchedNights

const historyCases: [string, Night[], string[]][] = [
  ["no nights", [], []],
  [
    "watched nights, in the given order",
    [night("b", "2026-06-15", WATCHED), night("a", "2026-06-01", WATCHED)],
    ["b", "a"],
  ],
  ["a watched night with no film still counts", [night("p", "2026-06-15", WATCHED)], ["p"]],
  ["tonight is excluded until it's recorded", [night("t", TODAY)], []],
  ["yesterday's unwatched night is excluded", [night("y", "2026-06-21"), night("p", "2026-06-15", WATCHED)], ["p"]],
  ["upcoming nights are excluded", [night("u", "2026-06-23"), night("p", "2026-06-15", WATCHED)], ["p"]],
];
for (const [name, nights, want] of historyCases) {
  test(`watchedNights: ${name}`, () => {
    assert.deepEqual(ids(watchedNights(nights)), want);
  });
}

test("an unwatched past Night is planned and not on Watched; recorded, it moves over", () => {
  const due = night("y", "2026-06-21");
  assert.deepEqual(ids(plannedNights([due])), ["y"]);
  assert.deepEqual(ids(watchedNights([due])), []);
  const recorded = { ...due, ...WATCHED };
  assert.deepEqual(ids(plannedNights([recorded])), []);
  assert.deepEqual(ids(watchedNights([recorded])), ["y"]);
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

// plannedNights

const plannedCases: [string, Night[], string[]][] = [
  ["no nights", [], []],
  ["only watched nights", [night("p", "2026-06-20", WATCHED)], []],
  [
    "every unwatched night, soonest first",
    [
      night("far", "2026-07-10"),
      night("w", "2026-06-01", WATCHED),
      night("t", TODAY),
      night("y", "2026-06-21"),
      night("soon", "2026-06-26"),
    ],
    ["y", "t", "soon", "far"],
  ],
];
for (const [name, nights, want] of plannedCases) {
  test(`plannedNights: ${name}`, () => {
    assert.deepEqual(ids(plannedNights(nights)), want);
  });
}
