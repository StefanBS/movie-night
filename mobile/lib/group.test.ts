import { test } from "node:test";
import assert from "node:assert/strict";

import { parseGroup, type Group } from "./group";

// parseGroup validates an untrusted JSON payload from the backend and returns a
// typed Group, or throws a descriptive error. Pure, table-driven.

test("parses a valid group", () => {
  const raw = { name: "Friday Film Club", createdOn: "2026-05-01" };
  const want: Group = { name: "Friday Film Club", createdOn: "2026-05-01" };
  assert.deepEqual(parseGroup(raw), want);
});

const invalid: { name: string; raw: unknown; wantError: RegExp }[] = [
  { name: "rejects a non-object payload", raw: "nope", wantError: /object/ },
  { name: "rejects a null payload", raw: null, wantError: /object/ },
  {
    name: "rejects a missing name",
    raw: { createdOn: "2026-05-01" },
    wantError: /name/,
  },
  {
    name: "rejects a non-string name",
    raw: { name: 42, createdOn: "2026-05-01" },
    wantError: /name/,
  },
  {
    name: "rejects a missing createdOn",
    raw: { name: "Friday Film Club" },
    wantError: /createdOn/,
  },
  {
    name: "rejects a non-string createdOn",
    raw: { name: "Friday Film Club", createdOn: 7 },
    wantError: /createdOn/,
  },
];

for (const c of invalid) {
  test(c.name, () => {
    assert.throws(() => parseGroup(c.raw), c.wantError);
  });
}
