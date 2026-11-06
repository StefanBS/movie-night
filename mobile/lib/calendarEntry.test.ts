import { test } from "node:test";
import assert from "node:assert/strict";

import { calendarEntry, calendarRecurrence, seriesNote, type CalendarRecurrence } from "./calendarEntry";
import type { Movie } from "./movies";
import type { Night } from "./nights";
import type { Repeat } from "./repeat";

const ID = "11111111-2222-3333-4444-555555555555";

function night(opts: Partial<Night> = {}): Night {
  return {
    id: ID,
    scheduledFor: "2026-11-06",
    startTime: null,
    pickerId: "b",
    movie: null,
    attendees: [
      { id: "a", name: "Alex Moreno", role: "core" },
      { id: "b", name: "Bea Lind", role: "core" },
      { id: "g", name: "Gus", role: "guest" },
    ],
    reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
    watchedAt: null,
    repeat: null,
    ...opts,
  };
}

const WEEKLY: Repeat = { freq: "weekly", intervalWeeks: 1 };
const SERIES_NOTES = (cadence: string) => `${cadence}. Open Movie Night for who's picking, who's coming and the film.`;

const movie = (releaseYear: number | null): Movie => ({ tmdbId: 949, title: "Heat", releaseYear, posterUrl: null, genres: [], runtimeMinutes: null });

test("calendarEntry titles the entry after the club, never the picker", () => {
  const cases: { name: string; groupName: string | null; want: string }[] = [
    { name: "club name", groupName: "Friday Film Club", want: "Friday Film Club · Movie night" },
    { name: "name not loaded", groupName: null, want: "Movie night" },
    { name: "blank name", groupName: "  ", want: "Movie night" },
  ];
  for (const c of cases) {
    assert.equal(calendarEntry(night(), c.groupName, null).title, c.want, c.name);
  }
});

test("calendarEntry notes: a one-off lists who's coming, the film and its link; a series only what holds every week", () => {
  const link = `movienight://night/${ID}`;
  const cases: { name: string; night: Night; recurrence: CalendarRecurrence | null; notes: string; url: string | null }[] = [
    { name: "no film", night: night(), recurrence: null, notes: `Coming: Alex Moreno, Bea Lind, Gus\n${link}`, url: link },
    { name: "film with year", night: night({ movie: movie(1995) }), recurrence: null, notes: `Coming: Alex Moreno, Bea Lind, Gus\nFilm: Heat (1995)\n${link}`, url: link },
    { name: "film without year", night: night({ movie: movie(null) }), recurrence: null, notes: `Coming: Alex Moreno, Bea Lind, Gus\nFilm: Heat\n${link}`, url: link },
    // A weekly night added as just this night is a one-off entry.
    { name: "weekly, just this night", night: night({ repeat: WEEKLY }), recurrence: null, notes: `Coming: Alex Moreno, Bea Lind, Gus\n${link}`, url: link },
    // 2026-11-06 is a Friday. The film, the people and the night change week to week.
    { name: "weekly series", night: night({ repeat: WEEKLY, movie: movie(1995) }), recurrence: { interval: 1 }, notes: SERIES_NOTES("Every Friday"), url: null },
  ];
  for (const c of cases) {
    const entry = calendarEntry(c.night, "Friday Film Club", c.recurrence);
    assert.equal(entry.notes, c.notes, c.name);
    assert.equal(entry.url, c.url, c.name);
  }
});

test("calendarEntry runs 3 hours from the start time, or 7:30 PM, local time", () => {
  const cases: { scheduledFor: string; startTime: string | null; start: Date; end: Date }[] = [
    { scheduledFor: "2026-11-06", startTime: null, start: new Date(2026, 10, 6, 19, 30), end: new Date(2026, 10, 6, 22, 30) },
    { scheduledFor: "2026-11-06", startTime: "20:15", start: new Date(2026, 10, 6, 20, 15), end: new Date(2026, 10, 6, 23, 15) },
    // A late start runs past midnight into the next day (and year).
    { scheduledFor: "2026-12-31", startTime: "22:45", start: new Date(2026, 11, 31, 22, 45), end: new Date(2027, 0, 1, 1, 45) },
  ];
  for (const c of cases) {
    const entry = calendarEntry(night({ scheduledFor: c.scheduledFor, startTime: c.startTime }), null, null);
    assert.deepEqual(entry.startDate, c.start, `${c.scheduledFor} ${c.startTime}`);
    assert.deepEqual(entry.endDate, c.end, `${c.scheduledFor} ${c.startTime}`);
  }
});

test("calendarRecurrence: a weekly repeat becomes an open-ended weekly rule; others add the one night", () => {
  const cases: { name: string; repeat: Repeat | null; want: CalendarRecurrence | null }[] = [
    { name: "one-off", repeat: null, want: null },
    { name: "every week", repeat: { freq: "weekly", intervalWeeks: 1 }, want: { interval: 1 } },
    // expo-calendar can't pass a monthly "Nth weekday" rule to either OS form.
    { name: "third Friday", repeat: { freq: "monthly", week: 3 }, want: null },
  ];
  for (const c of cases) {
    assert.deepEqual(calendarRecurrence(c.repeat), c.want, c.name);
  }
});

test("seriesNote describes the cadence mid-sentence", () => {
  const cases: { name: string; repeat: Repeat; date: string; want: string }[] = [
    { name: "every week", repeat: { freq: "weekly", intervalWeeks: 1 }, date: "2026-11-20", want: "every Friday" },
  ];
  for (const c of cases) {
    assert.equal(seriesNote(c.repeat, c.date), c.want, c.name);
  }
});
