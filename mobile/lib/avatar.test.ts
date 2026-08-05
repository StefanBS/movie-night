import { test } from "node:test";
import assert from "node:assert/strict";

import { avatarTint, firstName, initials } from "./avatar";
import { avatarTints } from "../theme/colors";

test("avatarTint is deterministic for the same name", () => {
  assert.equal(avatarTint("Alex Rivera"), avatarTint("Alex Rivera"));
});

test("avatarTint always returns a ring tint", () => {
  for (const name of ["Alex", "Tomas", "Priya", "Sam", "", "  "]) {
    assert.ok((avatarTints as readonly string[]).includes(avatarTint(name)));
  }
});

test("avatarTint distributes across more than one tint", () => {
  const names = ["Alex", "Tomas", "Priya", "Sam", "Noor", "Kai", "Mia", "Leo"];
  const used = new Set(names.map(avatarTint));
  assert.ok(used.size > 1);
});

test("firstName handles the common cases", () => {
  const cases: [string, string][] = [
    ["Alex Rivera", "Alex"],
    ["Tomas", "Tomas"],
    ["  priya  patel ", "priya"],
    ["Jean-Luc Picard", "Jean-Luc"],
    ["", ""],
    ["   ", ""],
  ];
  for (const [input, want] of cases) {
    assert.equal(firstName(input), want, `firstName(${JSON.stringify(input)})`);
  }
});

test("initials handles the common cases", () => {
  const cases: [string, string][] = [
    ["Alex Rivera", "AR"],
    ["Tomas", "T"],
    ["  priya  patel ", "PP"],
    ["madonna", "M"],
    ["Jean-Luc Picard", "JP"],
    ["", "?"],
    ["   ", "?"],
  ];
  for (const [input, want] of cases) {
    assert.equal(initials(input), want, `initials(${JSON.stringify(input)})`);
  }
});
