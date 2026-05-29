import { test } from "node:test";
import assert from "node:assert/strict";

import { parseMembers, type Member } from "./members";

// parseMembers validates an untrusted JSON payload from the backend and
// returns typed Members, or throws a descriptive error. Pure, table-driven.

test("parses a valid array of members", () => {
  const raw = [
    { id: "a", name: "Ada", role: "core" },
    { id: "b", name: "Bo", role: "guest" },
  ];
  const want: Member[] = [
    { id: "a", name: "Ada", role: "core" },
    { id: "b", name: "Bo", role: "guest" },
  ];
  assert.deepEqual(parseMembers(raw), want);
});

test("parses an empty array", () => {
  assert.deepEqual(parseMembers([]), []);
});

const invalid: { name: string; raw: unknown; wantError: RegExp }[] = [
  { name: "rejects a non-array payload", raw: { id: "a" }, wantError: /array/ },
  { name: "rejects a null payload", raw: null, wantError: /array/ },
  {
    name: "rejects a non-object element",
    raw: ["nope"],
    wantError: /member 0.*object/,
  },
  {
    name: "rejects a missing id",
    raw: [{ name: "Ada", role: "core" }],
    wantError: /member 0.*id/,
  },
  {
    name: "rejects a non-string name",
    raw: [{ id: "a", name: 42, role: "core" }],
    wantError: /member 0.*name/,
  },
  {
    name: "rejects an unknown role",
    raw: [{ id: "a", name: "Ada", role: "admin" }],
    wantError: /member 0.*role/,
  },
];

for (const c of invalid) {
  test(c.name, () => {
    assert.throws(() => parseMembers(c.raw), c.wantError);
  });
}
