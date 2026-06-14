import { test } from "node:test";
import assert from "node:assert/strict";

import { memberActions, parseMembers, type Member, type MemberAction } from "./members";

// parseMembers validates an untrusted JSON payload from the backend and
// returns typed Members, or throws a descriptive error. Pure, table-driven.

test("parses a valid array of members", () => {
  const raw = [
    { id: "a", name: "Ada", role: "core", status: "active" },
    { id: "b", name: "Bo", role: "guest", status: "inactive" },
  ];
  const want: Member[] = [
    { id: "a", name: "Ada", role: "core", status: "active" },
    { id: "b", name: "Bo", role: "guest", status: "inactive" },
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
    raw: [{ name: "Ada", role: "core", status: "active" }],
    wantError: /member 0.*id/,
  },
  {
    name: "rejects a non-string name",
    raw: [{ id: "a", name: 42, role: "core", status: "active" }],
    wantError: /member 0.*name/,
  },
  {
    name: "rejects an unknown role",
    raw: [{ id: "a", name: "Ada", role: "admin", status: "active" }],
    wantError: /member 0.*role/,
  },
  {
    name: "rejects an unknown status",
    raw: [{ id: "a", name: "Ada", role: "core", status: "left" }],
    wantError: /member 0.*status/,
  },
];

for (const c of invalid) {
  test(c.name, () => {
    assert.throws(() => parseMembers(c.raw), c.wantError);
  });
}

// memberActions maps a member's state to the churn transitions it can undergo.
const actionCases: { name: string; member: Member; want: MemberAction[] }[] = [
  {
    name: "inactive member can only reactivate",
    member: { id: "a", name: "Ada", role: "core", status: "inactive" },
    want: ["reactivate"],
  },
  {
    name: "active guest can promote or deactivate",
    member: { id: "b", name: "Bo", role: "guest", status: "active" },
    want: ["promote", "deactivate"],
  },
  {
    name: "active core member can only deactivate",
    member: { id: "c", name: "Cy", role: "core", status: "active" },
    want: ["deactivate"],
  },
];

for (const c of actionCases) {
  test(c.name, () => {
    assert.deepEqual(memberActions(c.member), c.want);
  });
}
