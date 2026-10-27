import { test } from "node:test";
import assert from "node:assert/strict";

import { calendarEntry } from "./calendarEntry";
import type { Movie } from "./movies";
import type { Night } from "./nights";

const ID = "11111111-2222-3333-4444-555555555555";

function night(opts: Partial<Night> = {}): Night {
  return {
    id: ID,
    scheduledFor: "2026-11-06",
    pickerId: "b",
    movie: null,
    attendees: [
      { id: "a", name: "Alex Moreno", role: "core" },
      { id: "b", name: "Bea Lind", role: "core" },
      { id: "g", name: "Gus", role: "guest" },
    ],
    reminders: { nightBefore: true, morningOf: true, audience: "everyone" },
    ...opts,
  };
}

const movie = (releaseYear: number | null): Movie => ({ tmdbId: 949, title: "Heat", releaseYear, posterUrl: null });

test("calendarEntry titles the entry after the picker's first name", () => {
  const cases: { name: string; night: Night; want: string }[] = [
    { name: "core picker", night: night(), want: "🎬 Movie Night — Bea picks" },
    { name: "guest picker", night: night({ pickerId: "g" }), want: "🎬 Movie Night — Gus picks" },
    { name: "picker missing from attendees", night: night({ pickerId: "zz" }), want: "🎬 Movie Night" },
  ];
  for (const c of cases) {
    assert.equal(calendarEntry(c.night).title, c.want, c.name);
  }
});

test("calendarEntry notes list who's coming, the film if chosen, and the link back", () => {
  const link = `movienight://night/${ID}`;
  const cases: { name: string; night: Night; want: string }[] = [
    { name: "no film", night: night(), want: `Coming: Alex Moreno, Bea Lind, Gus\n${link}` },
    { name: "film with year", night: night({ movie: movie(1995) }), want: `Coming: Alex Moreno, Bea Lind, Gus\nFilm: Heat (1995)\n${link}` },
    { name: "film without year", night: night({ movie: movie(null) }), want: `Coming: Alex Moreno, Bea Lind, Gus\nFilm: Heat\n${link}` },
  ];
  for (const c of cases) {
    assert.equal(calendarEntry(c.night).notes, c.want, c.name);
  }
  assert.equal(calendarEntry(night()).url, link);
});

test("calendarEntry runs 7:30–10:30 PM local time on the Night's date", () => {
  const cases: { scheduledFor: string; start: Date; end: Date }[] = [
    { scheduledFor: "2026-11-06", start: new Date(2026, 10, 6, 19, 30), end: new Date(2026, 10, 6, 22, 30) },
    { scheduledFor: "2026-12-31", start: new Date(2026, 11, 31, 19, 30), end: new Date(2026, 11, 31, 22, 30) },
    { scheduledFor: "2027-01-01", start: new Date(2027, 0, 1, 19, 30), end: new Date(2027, 0, 1, 22, 30) },
  ];
  for (const c of cases) {
    const entry = calendarEntry(night({ scheduledFor: c.scheduledFor }));
    assert.deepEqual(entry.startDate, c.start, c.scheduledFor);
    assert.deepEqual(entry.endDate, c.end, c.scheduledFor);
  }
});
