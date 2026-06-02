import { test } from "node:test";
import assert from "node:assert/strict";

import { parseTurn, type TurnMember } from "./turn";

// parseTurn validates an untrusted JSON payload from the backend and returns
// typed TurnMembers, or throws a descriptive error. Pure, table-driven.

test("parses a valid ranked array", () => {
  const raw = [
    { id: "a", name: "Ada", role: "core", servedCount: 0, lastPickedOn: null },
    { id: "b", name: "Bo", role: "core", servedCount: 1, lastPickedOn: "2026-04-10" },
  ];
  const want: TurnMember[] = [
    { id: "a", name: "Ada", role: "core", servedCount: 0, lastPickedOn: null },
    { id: "b", name: "Bo", role: "core", servedCount: 1, lastPickedOn: "2026-04-10" },
  ];
  assert.deepEqual(parseTurn(raw), want);
});

test("parses an empty array", () => {
  assert.deepEqual(parseTurn([]), []);
});

const invalid: { name: string; raw: unknown; wantError: RegExp }[] = [
  { name: "rejects a non-array payload", raw: { id: "a" }, wantError: /array/ },
  { name: "rejects a null payload", raw: null, wantError: /array/ },
  { name: "rejects a non-object element", raw: ["nope"], wantError: /member 0.*object/ },
  { name: "rejects a missing id", raw: [{ name: "Ada", role: "core", servedCount: 0, lastPickedOn: null }], wantError: /member 0.*id/ },
  { name: "rejects a non-string name", raw: [{ id: "a", name: 42, role: "core", servedCount: 0, lastPickedOn: null }], wantError: /member 0.*name/ },
  { name: "rejects an unknown role", raw: [{ id: "a", name: "Ada", role: "admin", servedCount: 0, lastPickedOn: null }], wantError: /member 0.*role/ },
  { name: "rejects a non-number servedCount", raw: [{ id: "a", name: "Ada", role: "core", servedCount: "x", lastPickedOn: null }], wantError: /member 0.*servedCount/ },
  { name: "rejects a non-string non-null lastPickedOn", raw: [{ id: "a", name: "Ada", role: "core", servedCount: 0, lastPickedOn: 5 }], wantError: /member 0.*lastPickedOn/ },
];

for (const c of invalid) {
  test(c.name, () => {
    assert.throws(() => parseTurn(c.raw), c.wantError);
  });
}
