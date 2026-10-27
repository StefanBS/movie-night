import { test } from "node:test";
import assert from "node:assert/strict";

import { draftPicker } from "./nightDraft";
import type { TurnMember } from "./turn";

const member = (id: string): TurnMember => ({
  id,
  name: id,
  role: "core",
  servedCount: 0,
  lastPickedOn: null,
});

const cases: [string, TurnMember[], string[], string | null, string | null][] = [
  ["follows the head of the order", [member("ada"), member("blake")], ["ada", "blake"], null, "ada"],
  ["an explicit choice wins over the order", [member("ada"), member("blake")], ["ada", "blake"], "blake", "blake"],
  ["a guest can be chosen", [member("ada")], ["ada", "frankie"], "frankie", "frankie"],
  ["a chosen picker who left falls back to the order", [member("ada")], ["ada"], "blake", "ada"],
  ["guest-only plan with no choice has no picker", [], ["frankie"], null, null],
  ["guest-only plan with a choice", [], ["frankie"], "frankie", "frankie"],
  ["nobody attending", [], [], null, null],
];
for (const [name, order, attending, chosen, want] of cases) {
  test(`draftPicker: ${name}`, () => {
    assert.equal(draftPicker(order, new Set(attending), chosen), want);
  });
}
