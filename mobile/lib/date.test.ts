import { test } from "node:test";
import assert from "node:assert/strict";

import { todayLocalISO } from "./date";

// Dates are built from local-time components, so these assertions are
// timezone-independent.
test("formats a date as local YYYY-MM-DD", () => {
  assert.equal(todayLocalISO(new Date(2026, 5, 2, 23, 59)), "2026-06-02");
});

test("zero-pads single-digit month and day", () => {
  assert.equal(todayLocalISO(new Date(2026, 0, 5, 0, 0)), "2026-01-05");
});

test("handles the year-end boundary", () => {
  assert.equal(todayLocalISO(new Date(2025, 11, 31, 23, 59)), "2025-12-31");
});
