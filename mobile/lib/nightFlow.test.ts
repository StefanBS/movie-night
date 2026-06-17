import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveInitialStep, type Step } from "./nightFlow";
import type { Night } from "./nights";

// Minimal Night builder — only the fields deriveInitialStep reads matter.
function night(overrides: Partial<Night>): Night {
  return {
    id: "n1",
    scheduledFor: "2026-06-17",
    pickerId: null,
    movie: null,
    attendees: [],
    ...overrides,
  };
}

const MOVIE = { tmdbId: 1, title: "Past Lives", releaseYear: 2023, posterUrl: null };

test("deriveInitialStep maps a resumed night to its wizard step", () => {
  const cases: { name: string; input: Night; want: Step }[] = [
    { name: "fresh night → who", input: night({}), want: "who" },
    { name: "picker recorded, no movie → pick", input: night({ pickerId: "m1" }), want: "pick" },
    { name: "movie attached → recorded", input: night({ pickerId: "m1", movie: MOVIE }), want: "recorded" },
    { name: "movie attached without picker (defensive) → recorded", input: night({ movie: MOVIE }), want: "recorded" },
  ];
  for (const c of cases) {
    assert.equal(deriveInitialStep(c.input), c.want, c.name);
  }
});
