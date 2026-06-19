import { test } from "node:test";
import assert from "node:assert/strict";

import {
  daysUntil,
  formatMonthYear,
  formatShortDate,
  todayLocalISO,
  weekday,
} from "./date";

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

test("formats an ISO date as a short month + day", () => {
  assert.equal(formatShortDate("2026-05-30"), "May 30");
});

test("does not zero-pad the day", () => {
  assert.equal(formatShortDate("2026-01-05"), "Jan 5");
});

test("formats December correctly (last month index)", () => {
  assert.equal(formatShortDate("2025-12-31"), "Dec 31");
});

test("formatMonthYear renders a month-and-year label", () => {
  assert.equal(formatMonthYear("2024-06-15"), "Jun 2024");
  assert.equal(formatMonthYear("2023-12-01"), "Dec 2023");
});

// weekday() and daysUntil() are built from local-time components, so these
// assertions are timezone-independent. daysUntil takes an explicit `today`
// anchor for determinism.

test("weekday returns the short name by default", () => {
  assert.equal(weekday("2026-06-19"), "Fri");
});

test("weekday returns the long name when long=true", () => {
  assert.equal(weekday("2026-06-19", true), "Friday");
});

test("weekday handles Sunday (index 0) and Saturday (index 6)", () => {
  assert.equal(weekday("2026-06-21", true), "Sunday");
  assert.equal(weekday("2026-06-20", true), "Saturday");
});

test("daysUntil is 0 for the same day", () => {
  assert.equal(daysUntil("2026-06-19", "2026-06-19"), 0);
});

test("daysUntil is positive for a future date", () => {
  assert.equal(daysUntil("2026-06-26", "2026-06-19"), 7);
});

test("daysUntil is negative for a past date", () => {
  assert.equal(daysUntil("2026-06-18", "2026-06-19"), -1);
});

test("daysUntil counts across a month boundary", () => {
  assert.equal(daysUntil("2026-07-01", "2026-06-19"), 12);
});

test("daysUntil counts across a year boundary", () => {
  assert.equal(daysUntil("2027-01-01", "2026-12-31"), 1);
});
