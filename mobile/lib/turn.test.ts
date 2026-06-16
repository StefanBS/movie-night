import { test } from "node:test";
import assert from "node:assert/strict";

import { parseTurn, picksLabel, pickerMeta, type TurnMember } from "./turn";

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

test("picksLabel singularizes one pick", () => {
  assert.equal(picksLabel(1), "1 pick");
});

const picksCases: { n: number; want: string }[] = [
  { n: 0, want: "0 picks" },
  { n: 2, want: "2 picks" },
  { n: 12, want: "12 picks" },
];
for (const c of picksCases) {
  test(`picksLabel(${c.n}) is "${c.want}"`, () => {
    assert.equal(picksLabel(c.n), c.want);
  });
}

test("pickerMeta shows the first-turn copy when never picked", () => {
  const m: TurnMember = {
    id: "a", name: "Ada", role: "core", servedCount: 0, lastPickedOn: null,
  };
  assert.equal(pickerMeta(m), "First turn · hasn't picked yet");
});

test("pickerMeta shows picks count and last date once picked", () => {
  const m: TurnMember = {
    id: "b", name: "Bo", role: "core", servedCount: 2, lastPickedOn: "2026-05-30",
  };
  assert.equal(pickerMeta(m), "2 picks · last May 30");
});

test("pickerMeta falls back to first-turn copy if servedCount>0 but date missing", () => {
  const m: TurnMember = {
    id: "c", name: "Cy", role: "core", servedCount: 1, lastPickedOn: null,
  };
  assert.equal(pickerMeta(m), "First turn · hasn't picked yet");
});
