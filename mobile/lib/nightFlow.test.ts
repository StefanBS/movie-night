import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveInitialStep, isResumable, type Step } from "./nightFlow";
import type { Night } from "./nights";

const TODAY = "2026-06-20";

function night(over: Partial<Night>): Night {
  return {
    id: "n1",
    scheduledFor: TODAY,
    pickerId: null,
    movie: null,
    attendees: [],
    ...over,
  };
}

const movie = { tmdbId: 1, title: "X", releaseYear: 2020, posterUrl: null };

const cases: [string, Night, Step][] = [
  ["movie attached → night", night({ movie }), "night"],
  ["future + picker → night", night({ scheduledFor: "2026-06-27", pickerId: "p1" }), "night"],
  ["future + picker + movie → night", night({ scheduledFor: "2026-06-27", pickerId: "p1", movie }), "night"],
  ["future + no picker → who", night({ scheduledFor: "2026-06-27" }), "who"],
  ["tonight + picker (no movie) → who", night({ pickerId: "p1" }), "who"],
  ["tonight + no picker → who", night({}), "who"],
  ["past + picker (no movie) → who", night({ scheduledFor: "2026-06-10", pickerId: "p1" }), "who"],
  ["movie present even with no picker → night", night({ movie, pickerId: null }), "night"],
];

for (const [name, n, expected] of cases) {
  test(`deriveInitialStep: ${name}`, () => {
    assert.equal(deriveInitialStep(n, TODAY), expected);
  });
}

test("isResumable: future stays resumable even with a film; past/tonight done once filmed", () => {
  assert.equal(isResumable(night({}), TODAY), true); // tonight, no film
  assert.equal(isResumable(night({ movie }), TODAY), false); // tonight, filmed → done
  assert.equal(isResumable(night({ scheduledFor: "2026-06-27", pickerId: "p1" }), TODAY), true); // future, no film
  assert.equal(isResumable(night({ scheduledFor: "2026-06-27", movie }), TODAY), true); // future, filmed
  assert.equal(isResumable(night({ scheduledFor: "2026-06-10", movie }), TODAY), false); // past, filmed → done
});
