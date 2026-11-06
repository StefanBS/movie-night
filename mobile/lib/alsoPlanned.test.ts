import { test } from "node:test";
import assert from "node:assert/strict";

import type { Night } from "./nights";
import { alsoPlannedPicks } from "./alsoPlanned";
import { aNight } from "./fixtures";

function night(opts: Partial<Night> = {}): Night {
  return aNight({
    pickerId: "p",
    attendees: [
      { id: "a", name: "Ada Lovelace" },
      { id: "p", name: "Priya Raman" },
    ],
    ...opts,
  });
}

const picksCases: [string, Night, string][] = [
  ["the picker's first name", night(), "Priya picks"],
];
for (const [name, n, want] of picksCases) {
  test(`alsoPlannedPicks: ${name}`, () => {
    assert.equal(alsoPlannedPicks(n), want);
  });
}
