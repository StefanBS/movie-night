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
  ["movie attached → recorded", night({ movie }), "recorded"],
  ["future + picker → scheduled", night({ scheduledFor: "2026-06-27", pickerId: "p1" }), "scheduled"],
  ["future + no picker → who", night({ scheduledFor: "2026-06-27" }), "who"],
  ["tonight + picker (no movie) → who", night({ pickerId: "p1" }), "who"],
  ["tonight + no picker → who", night({}), "who"],
  ["past + picker (no movie) → who", night({ scheduledFor: "2026-06-10", pickerId: "p1" }), "who"],
  ["movie present even with no picker → recorded", night({ movie, pickerId: null }), "recorded"],
  ["movie present beats a future picker → recorded", night({ scheduledFor: "2026-06-27", pickerId: "p1", movie }), "recorded"],
];

for (const [name, n, expected] of cases) {
  test(`deriveInitialStep: ${name}`, () => {
    assert.equal(deriveInitialStep(n, TODAY), expected);
  });
}

test("isResumable: unchanged — open until a movie attaches", () => {
  assert.equal(isResumable(night({})), true);
  assert.equal(isResumable(night({ movie })), false);
  assert.equal(isResumable(night({ scheduledFor: "2026-06-27", pickerId: "p1" })), true);
});
