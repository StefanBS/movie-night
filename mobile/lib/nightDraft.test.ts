import { test } from "node:test";
import assert from "node:assert/strict";

import { draftPicker, rankAmong } from "./nightDraft";
import type { TurnMember } from "./turn";

const member = (id: string): TurnMember => ({
  id,
  name: id,
  servedCount: 0,
  lastPickedOn: null,
});

const cases: [string, TurnMember[], string[], string | null, string | null][] = [
  ["follows the head of the order", [member("ada"), member("blake")], ["ada", "blake"], null, "ada"],
  ["an explicit choice wins over the order", [member("ada"), member("blake")], ["ada", "blake"], "blake", "blake"],
  ["a guest can be chosen", [member("ada")], ["ada", "frankie"], "frankie", "frankie"],
  ["a chosen picker who left falls back to the order", [member("ada")], ["ada"], "blake", "ada"],
  ["guest-only plan with no choice has no picker", [], ["frankie"], null, null],
];
for (const [name, order, attending, chosen, want] of cases) {
  test(`draftPicker: ${name}`, () => {
    assert.equal(draftPicker(order, new Set(attending), chosen), want);
  });
}

// rankAmong over the full ranking must match what the backend returns for
// that subset (RankGroupTurn filtered by `present`): its ORDER BY — served
// count, then last pick (never-picked first), then rotation position — never
// looks at who is present. FULL is the backend's order for every core member;
// each case's want is the order the backend gives the subset directly.
const ranks = (id: string, servedCount: number, lastPickedOn: string | null): TurnMember => ({
  id,
  name: id,
  servedCount,
  lastPickedOn,
});
const FULL = [
  ranks("ada", 0, null),
  ranks("blake", 1, "2026-04-10"),
  ranks("cleo", 1, "2026-05-01"),
  ranks("dev", 2, "2026-03-01"),
];
const rankCases: [string, string[], string[]][] = [
  ["everyone keeps the full order", ["ada", "blake", "cleo", "dev"], ["ada", "blake", "cleo", "dev"]],
  ["the absent drop out, the rest keep their order", ["dev", "cleo", "ada"], ["ada", "cleo", "dev"]],
  ["a tie on served count still breaks on the last pick", ["cleo", "blake"], ["blake", "cleo"]],
  ["guests aren't in the ranking", ["dev", "frankie"], ["dev"]],
  ["nobody attending ranks nobody", [], []],
];
for (const [name, attending, want] of rankCases) {
  test(`rankAmong: ${name}`, () => {
    assert.deepEqual(rankAmong(FULL, new Set(attending)).map((m) => m.id), want);
  });
}
