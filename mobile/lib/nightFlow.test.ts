import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveInitialStep, isResumable, type Step } from "./nightFlow";
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

const movie = { tmdbId: 1, title: "Past Lives", releaseYear: 2023, posterUrl: null };

const cases: { name: string; input: Night; want: Step }[] = [
  { name: "fresh night → who", input: night({}), want: "who" },
  // A picker recorded without a movie resumes at attendance, not mid-pick: the
  // "pick" step is a forward-only transition, never a resume target. Attendance
  // is preserved and the picker is re-derived, so re-entering at "who" is
  // non-destructive — and avoids the wizard skipping step 1 on resume.
  { name: "picker recorded, no movie → who", input: night({ pickerId: "m1" }), want: "who" },
  { name: "movie attached → recorded", input: night({ pickerId: "m1", movie }), want: "recorded" },
  { name: "movie attached without picker (defensive) → recorded", input: night({ movie }), want: "recorded" },
];

for (const c of cases) {
  test(`deriveInitialStep: ${c.name}`, () => {
    assert.equal(deriveInitialStep(c.input), c.want);
  });
}

// A night is resumable only until it has a film attached. Once a movie is
// recorded the night is done, so "Plan a night" starts a fresh one rather than
// re-opening a finished (possibly long-past) night.
const resumeCases: { name: string; input: Night; want: boolean }[] = [
  { name: "fresh night → resumable", input: night({}), want: true },
  { name: "picker recorded, no movie → resumable", input: night({ pickerId: "m1" }), want: true },
  { name: "movie attached → done", input: night({ pickerId: "m1", movie }), want: false },
  { name: "movie attached without picker (defensive) → done", input: night({ movie }), want: false },
];

for (const c of resumeCases) {
  test(`isResumable: ${c.name}`, () => {
    assert.equal(isResumable(c.input), c.want);
  });
}
