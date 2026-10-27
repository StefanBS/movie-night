import { test } from "node:test";
import assert from "node:assert/strict";

import { reminderNightId } from "./reminderTap";

test("reminderNightId reads a reminder's Night id", () => {
  const id = "019a1b2c-3d4e-7f00-8a9b-0c1d2e3f4a5b";
  const cases: { name: string; data: unknown; want: string | null }[] = [
    { name: "a reminder", data: { nightId: id }, want: id },
    { name: "no data", data: undefined, want: null },
    { name: "null", data: null, want: null },
    { name: "another notification", data: { url: "/x" }, want: null },
    { name: "a non-string id", data: { nightId: 7 }, want: null },
    { name: "a path, not an id", data: { nightId: "../member/new" }, want: null },
  ];
  for (const c of cases) {
    assert.equal(reminderNightId(c.data), c.want, c.name);
  }
});
