import { test } from "node:test";
import assert from "node:assert/strict";

import { watchedNights, isDue, nightDates, nightLine, nightActions, nightLineParts, nightTiming, nightWording, plannedNights, upNextAction, type NightAction, type NightLineParts, type NightTiming, type NightWhen, type UpNextAction } from "./nightLifecycle";
import type { Night } from "./nights";
import { aMovie, aNight } from "./fixtures";

const TODAY = "2026-06-22";

function night(id: string, scheduledFor: string, opts: Partial<Night> = {}): Night {
  return aNight({ id, scheduledFor, ...opts });
}

const ids = (ns: Night[]) => ns.map((n) => n.id);

// nightTiming

const timingCases: [string, string, NightTiming][] = [
  ["tomorrow", "2026-06-23", "upcoming"],
  ["today", TODAY, "tonight"],
  ["yesterday", "2026-06-21", "past"],
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
];
for (const [name, n, want] of dueCases) {
  test(`isDue: ${name} → ${want}`, () => {
    assert.equal(isDue(n, TODAY), want);
  });
}

// upNextAction: the UpNextCard's primary button, the next thing to do.

const actionCases: [string, Night, UpNextAction][] = [
  ["no film, yesterday", night("p", "2026-06-21"), "chooseFilm"],
  ["film, tomorrow", night("u", "2026-06-23", { movie: aMovie() }), null],
  ["film, today", night("t", TODAY, { movie: aMovie() }), "watched"],
  ["film, yesterday, already recorded", night("p", "2026-06-21", { movie: aMovie(), ...WATCHED }), null],
];
for (const [name, n, want] of actionCases) {
  test(`upNextAction: ${name} → ${want}`, () => {
    assert.equal(upNextAction(n, TODAY), want);
  });
}

// nightActions: the ⋯ sheet's actions, in display order.

const TOMORROW = "2026-06-23";
const YESTERDAY = "2026-06-21";
const FILM = { movie: aMovie() };

const sheetCases: [string, Night, boolean, NightAction[]][] = [
  ["no film, ahead", night("u", TOMORROW), false, ["edit", "addToCalendar"]],
  ["no film, today", night("t", TODAY), false, ["edit", "addToCalendar"]],
  ["no film, past", night("p", YESTERDAY), false, ["edit"]],
  ["film, ahead", night("u", TOMORROW, FILM), false, ["changeFilm", "edit", "addToCalendar", "clearFilm"]],
  ["film, today", night("t", TODAY, FILM), false, ["changeFilm", "edit", "addToCalendar", "clearFilm"]],
  ["film, past", night("p", YESTERDAY, FILM), false, ["changeFilm", "edit", "clearFilm"]],
  ["film, today, watched", night("t", TODAY, { ...FILM, ...WATCHED }), false, ["changeFilm", "edit", "addToCalendar"]],
  ["film, past, watched", night("p", YESTERDAY, { ...FILM, ...WATCHED }), false, ["changeFilm", "edit"]],
  ["no film, ahead, web", night("u", TOMORROW), true, ["edit"]],
  ["film, ahead, web", night("u", TOMORROW, FILM), true, ["changeFilm", "edit", "clearFilm"]],
];
for (const [name, n, web, want] of sheetCases) {
  test(`nightActions: ${name} → ${want.join(", ")}`, () => {
    assert.deepEqual(nightActions(n, TODAY, { web }), want);
  });
}

// watchedNights

const historyCases: [string, Night[], string[]][] = [
  [
    "watched nights, in the given order",
    [night("b", "2026-06-15", WATCHED), night("a", "2026-06-01", WATCHED)],
    ["b", "a"],
  ],
  ["a watched night with no film still counts", [night("p", "2026-06-15", WATCHED)], ["p"]],
  ["yesterday's unwatched night is excluded", [night("y", "2026-06-21"), night("p", "2026-06-15", WATCHED)], ["p"]],
];
for (const [name, nights, want] of historyCases) {
  test(`watchedNights: ${name}`, () => {
    assert.deepEqual(ids(watchedNights(nights)), want);
  });
}

// nightDates

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

// nightLine. TODAY is a Monday; UPCOMING is the Thursday three days out. Each
// caller's parts are named for it, so a case pins the text that screen shows.
const NIGHT_SCREEN: NightLineParts = { countdown: "relative", date: "short" };
const UP_NEXT: NightLineParts = { countdown: "label", date: "long", repeat: true };
const EDIT_HERO = (picker: string): NightLineParts => ({ countdown: "label", picker });
const WHEN_STEP: NightLineParts = { date: "long", countdown: "trail" };
const ALSO_PLANNED: NightLineParts = { date: "compact" };
const weekly = { freq: "weekly", intervalWeeks: 1 } as const;

const lineCases: [string, NightWhen, NightLineParts, string][] = [
  // Night screen
  ["night screen: upcoming with a start time", { scheduledFor: UPCOMING, startTime: "20:00" }, NIGHT_SCREEN, "This Thursday · Jun 25 · 8:00 PM"],
  ["night screen: upcoming without a start time", { scheduledFor: UPCOMING, startTime: null }, NIGHT_SCREEN, "This Thursday · Jun 25"],
  ["night screen: tonight", { scheduledFor: TODAY, startTime: "19:30" }, NIGHT_SCREEN, "Tonight · Jun 22 · 7:30 PM"],
  ["night screen: past is the full date, never the time", { scheduledFor: PAST, startTime: "20:00" }, NIGHT_SCREEN, "Saturday, Jun 20"],
  ["night screen: far ahead says the full date once", { scheduledFor: "2026-07-11", startTime: "20:00" }, NIGHT_SCREEN, "Saturday, Jul 11 · 8:00 PM"],
  // Up next card
  ["up next: upcoming, repeating", { scheduledFor: UPCOMING, startTime: "20:00", repeat: weekly }, UP_NEXT, "In 3 days · Thursday, Jun 25 · 8:00 PM · Weekly"],
  ["up next: tonight, one-off", { scheduledFor: TODAY, startTime: null, repeat: null }, UP_NEXT, "Tonight · Monday, Jun 22"],
  ["up next: tomorrow, every 2 weeks", { scheduledFor: "2026-06-23", startTime: null, repeat: { freq: "weekly", intervalWeeks: 2 } }, UP_NEXT, "Tomorrow · Tuesday, Jun 23 · Every 2 weeks"],
  ["up next: past drops the countdown", { scheduledFor: PAST, startTime: "20:00", repeat: { freq: "monthly", week: 3 } }, UP_NEXT, "Saturday, Jun 20 · 8:00 PM · Monthly"],
  // Edit night hero
  ["edit hero: upcoming", { scheduledFor: UPCOMING, startTime: "20:00" }, EDIT_HERO("Tomas"), "In 3 days · 8:00 PM · Tomas picks"],
  ["edit hero: tonight without a time", { scheduledFor: TODAY, startTime: null }, EDIT_HERO("Tomas"), "Tonight · Tomas picks"],
  ["edit hero: past is just the picker", { scheduledFor: PAST, startTime: "20:00" }, EDIT_HERO("Tomas"), "8:00 PM · Tomas"],
  // New night When step
  ["when step: ahead with a time", { scheduledFor: UPCOMING, startTime: "20:00" }, WHEN_STEP, "Thursday, Jun 25 · 8:00 PM · in 3 days"],
  ["when step: ahead without a time", { scheduledFor: UPCOMING, startTime: null }, WHEN_STEP, "Thursday, Jun 25 · in 3 days"],
  ["when step: tonight has no countdown", { scheduledFor: TODAY, startTime: "20:00" }, WHEN_STEP, "Monday, Jun 22 · 8:00 PM"],
  ["when step: past has no countdown", { scheduledFor: PAST, startTime: null }, WHEN_STEP, "Saturday, Jun 20"],
  // Tonight's also planned rows
  ["also planned: date only", { scheduledFor: "2026-06-27", startTime: null }, ALSO_PLANNED, "Sat 27 Jun"],
  ["also planned: date and start time", { scheduledFor: "2026-06-27", startTime: "20:00" }, ALSO_PLANNED, "Sat 27 Jun · 8:00 PM"],
  // The repeat shows only when asked for
  ["repeat left out unless asked", { scheduledFor: UPCOMING, startTime: null, repeat: weekly }, { date: "short" }, "Jun 25"],
];
for (const [name, night, parts, want] of lineCases) {
  test(`nightLine: ${name}`, () => {
    assert.equal(nightLine(night, parts, TODAY, "en-US"), want);
  });
}

test("nightLine: a 24-hour locale keeps HH:MM", () => {
  assert.equal(nightLine({ scheduledFor: "2026-06-27", startTime: "20:00" }, ALSO_PLANNED, TODAY, "en-GB"), "Sat 27 Jun · 20:00");
});

test("nightLineParts: the When step styles its date part on its own", () => {
  assert.deepEqual(
    nightLineParts({ scheduledFor: UPCOMING, startTime: "20:00" }, WHEN_STEP, TODAY, "en-US"),
    ["Thursday, Jun 25", "8:00 PM", "in 3 days"],
  );
});

// plannedNights

const plannedCases: [string, Night[], string[]][] = [
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
