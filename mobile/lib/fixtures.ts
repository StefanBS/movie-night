import type { Member } from "./members";
import type { Movie } from "./movies";
import type { Night } from "./nights";
import type { TurnMember } from "./turn";

// Test data builders: plain values, not mocks. Each returns a complete, valid
// value, so a test spells out only the fields it is about. Adding a field to a
// type means adding its default here, once.

// aMovie is Dune with no poster, genres or runtime.
export function aMovie(over: Partial<Movie> = {}): Movie {
  return { tmdbId: 438631, title: "Dune", releaseYear: 2021, posterUrl: null, posterThumbUrl: null, genres: [], runtimeMinutes: null, ...over };
}

// aNight is a planned one-off Night: Ada picks and is the only attendee.
export function aNight(over: Partial<Night> = {}): Night {
  return {
    id: "n1",
    scheduledFor: "2026-06-26",
    startTime: null,
    pickerId: "ada",
    movie: null,
    attendees: [{ id: "ada", name: "Ada" }],
    reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
    watchedAt: null,
    repeat: null,
    ...over,
  };
}

// aMember is an active core member named after their id.
export function aMember(id: string, over: Partial<Member> = {}): Member {
  return { id, name: id, role: "core", status: "active", joinedOn: "2026-01-01", ...over };
}

// aTurnMember is a never-picked member of the rotation named after their id.
export function aTurnMember(id: string, over: Partial<TurnMember> = {}): TurnMember {
  return { id, name: id, servedCount: 0, lastPickedOn: null, ...over };
}
