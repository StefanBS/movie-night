import { test } from "node:test";
import assert from "node:assert/strict";

import { parsePick, type Pick } from "./picks";

test("parses a valid pick", () => {
  const raw = {
    id: "c1",
    groupId: "g1",
    pickerId: "p1",
    isCredited: true,
    scheduledFor: "2026-06-02",
    createdAt: "2026-06-02T15:04:05Z",
  };
  const want: Pick = { ...raw };
  assert.deepEqual(parsePick(raw), want);
});

const invalid: { name: string; raw: unknown; wantError: RegExp }[] = [
  { name: "rejects a non-object", raw: "nope", wantError: /pick object/ },
  { name: "rejects null", raw: null, wantError: /pick object/ },
  { name: "rejects a non-string id", raw: { id: 1, groupId: "g", pickerId: "p", isCredited: true, scheduledFor: "d", createdAt: "c" }, wantError: /id/ },
  { name: "rejects a non-string pickerId", raw: { id: "c", groupId: "g", pickerId: 2, isCredited: true, scheduledFor: "d", createdAt: "c" }, wantError: /pickerId/ },
  { name: "rejects a non-boolean isCredited", raw: { id: "c", groupId: "g", pickerId: "p", isCredited: "yes", scheduledFor: "d", createdAt: "c" }, wantError: /isCredited/ },
  { name: "rejects a missing scheduledFor", raw: { id: "c", groupId: "g", pickerId: "p", isCredited: true, createdAt: "c" }, wantError: /scheduledFor/ },
  { name: "rejects a non-string groupId", raw: { id: "c", groupId: 9, pickerId: "p", isCredited: true, scheduledFor: "d", createdAt: "c" }, wantError: /groupId/ },
  { name: "rejects a missing createdAt", raw: { id: "c", groupId: "g", pickerId: "p", isCredited: true, scheduledFor: "d" }, wantError: /createdAt/ },
];

for (const c of invalid) {
  test(c.name, () => {
    assert.throws(() => parsePick(c.raw), c.wantError);
  });
}
