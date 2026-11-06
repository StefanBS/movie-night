import { test } from "node:test";
import assert from "node:assert/strict";

import type { Night } from "./nights";
import { tonightLineup, type TonightLineup } from "./tonight";
import type { TurnMember } from "./turn";

const TODAY = "2026-06-22";
const WATCHED = { watchedAt: "2026-06-20T22:00:00Z" };

function night(id: string, scheduledFor: string, opts: Partial<Night> = {}): Night {
  return {
    id,
    scheduledFor,
    startTime: null,
    pickerId: "Cleo",
    movie: null,
    attendees: [],
    reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
    watchedAt: null,
    repeat: null,
    ...opts,
  };
}

// A ranking by name; ids are the names so cases read as the screen does.
const rank = (...names: string[]): TurnMember[] =>
  names.map((name) => ({ id: name, name, servedCount: 0, lastPickedOn: null }));

const CLUB = rank("Blake", "Ada", "Dev", "Esme", "Cleo");

// Lineups compared by ids and names, so each row reads as what Tonight shows.
type Shown =
  | { kind: "planned"; night: string; alsoPlanned: string[]; onDeck: string[] }
  | { kind: "unplanned"; picker: string; onDeck: string[] }
  | { kind: "empty" };

function shown(l: TonightLineup): Shown {
  const names = (ms: TurnMember[]) => ms.map((m) => m.name);
  switch (l.kind) {
    case "planned":
      return { kind: "planned", night: l.night.id, alsoPlanned: l.alsoPlanned.map((n) => n.id), onDeck: names(l.onDeck) };
    case "unplanned":
      return { kind: "unplanned", picker: l.picker.name, onDeck: names(l.onDeck) };
    case "empty":
      return { kind: "empty" };
  }
}

const cases: { name: string; ranking: TurnMember[]; nights: Night[]; want: Shown }[] = [
  // Which state Tonight is in.
  { name: "no nights: the ranking's head is next up", ranking: CLUB, nights: [], want: { kind: "unplanned", picker: "Blake", onDeck: ["Ada", "Dev", "Esme"] } },
  { name: "only watched nights count as none planned", ranking: CLUB, nights: [night("p", "2026-06-20", WATCHED)], want: { kind: "unplanned", picker: "Blake", onDeck: ["Ada", "Dev", "Esme"] } },
  { name: "nothing planned, no one in the rotation", ranking: [], nights: [], want: { kind: "empty" } },
  { name: "a planned night wins over an empty ranking (a guest's night)", ranking: [], nights: [night("g", TODAY, { pickerId: "Gus" })], want: { kind: "planned", night: "g", alsoPlanned: [], onDeck: [] } },

  // Who's on deck after the next picker (#222).
  { name: "planned picker already counted, at the bottom (#222)", ranking: CLUB, nights: [night("t", TODAY)], want: { kind: "planned", night: "t", alsoPlanned: [], onDeck: ["Blake", "Ada", "Dev"] } },
  { name: "planned picker chosen out of turn, mid-ranking", ranking: CLUB, nights: [night("t", TODAY, { pickerId: "Dev" })], want: { kind: "planned", night: "t", alsoPlanned: [], onDeck: ["Blake", "Ada", "Esme"] } },
  { name: "planned picker not in the rotation (a guest)", ranking: rank("Blake", "Ada", "Dev", "Esme"), nights: [night("t", TODAY, { pickerId: "Gus" })], want: { kind: "planned", night: "t", alsoPlanned: [], onDeck: ["Blake", "Ada", "Dev"] } },
  { name: "fewer than three others", ranking: rank("Blake", "Cleo"), nights: [night("t", TODAY)], want: { kind: "planned", night: "t", alsoPlanned: [], onDeck: ["Blake"] } },

  // Which Night is up next, and which are also planned.
  { name: "the soonest of several, the rest soonest first", ranking: CLUB, nights: [night("far", "2026-07-10"), night("soon", "2026-06-26"), night("mid", "2026-06-30")], want: { kind: "planned", night: "soon", alsoPlanned: ["mid", "far"], onDeck: ["Blake", "Ada", "Dev"] } },
  { name: "yesterday's unwatched night stays up next until it's recorded", ranking: CLUB, nights: [night("t", TODAY), night("y", "2026-06-21")], want: { kind: "planned", night: "y", alsoPlanned: ["t"], onDeck: ["Blake", "Ada", "Dev"] } },
  { name: "on deck follows the up-next night's picker, not a later one's", ranking: CLUB, nights: [night("soon", "2026-06-26", { pickerId: "Blake" }), night("later", "2026-07-03")], want: { kind: "planned", night: "soon", alsoPlanned: ["later"], onDeck: ["Ada", "Dev", "Esme"] } },
];

for (const c of cases) {
  test(`tonightLineup: ${c.name}`, () => {
    assert.deepEqual(shown(tonightLineup(c.ranking, c.nights)), c.want);
  });
}
