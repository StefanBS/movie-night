import { test } from "node:test";
import assert from "node:assert/strict";

import {
  countdownLabel,
  daysUntil,
  formatMonthYear,
  formatShortDate,
  formatWeekdayDate,
  relativeLabel,
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

// Label functions. relativeLabel/countdownLabel take an explicit `today` anchor
// so the day-count windows are deterministic. Anchored on Fri 2026-06-19.

test("formatWeekdayDate renders long weekday + short date", () => {
  assert.equal(formatWeekdayDate("2026-06-19"), "Friday, Jun 19");
});

test("formatWeekdayDate does not zero-pad the day", () => {
  assert.equal(formatWeekdayDate("2026-01-05"), "Monday, Jan 5");
});

test("formatWeekdayDate handles a December date", () => {
  assert.equal(formatWeekdayDate("2025-12-31"), "Wednesday, Dec 31");
});

test("relativeLabel says Tonight for today", () => {
  assert.equal(relativeLabel("2026-06-19", "2026-06-19"), "Tonight");
});

test("relativeLabel says Tomorrow for the next day", () => {
  assert.equal(relativeLabel("2026-06-20", "2026-06-19"), "Tomorrow");
});

test("relativeLabel says This <Weekday> within the week (2-6 days)", () => {
  assert.equal(relativeLabel("2026-06-21", "2026-06-19"), "This Sunday");
  assert.equal(relativeLabel("2026-06-25", "2026-06-19"), "This Thursday");
});

test("relativeLabel says Next <Weekday> for 7-13 days out", () => {
  assert.equal(relativeLabel("2026-06-26", "2026-06-19"), "Next Friday");
  assert.equal(relativeLabel("2026-07-02", "2026-06-19"), "Next Thursday");
});

test("relativeLabel falls back to the full date at 14 days out", () => {
  assert.equal(relativeLabel("2026-07-03", "2026-06-19"), "Friday, Jul 3");
});

test("relativeLabel falls back to the full date for past dates", () => {
  assert.equal(relativeLabel("2026-06-01", "2026-06-19"), "Monday, Jun 1");
});

test("countdownLabel handles tonight / tomorrow / yesterday", () => {
  assert.equal(countdownLabel("2026-06-19", "2026-06-19"), "tonight");
  assert.equal(countdownLabel("2026-06-20", "2026-06-19"), "tomorrow");
  assert.equal(countdownLabel("2026-06-18", "2026-06-19"), "yesterday");
});

test("countdownLabel counts future and past days", () => {
  assert.equal(countdownLabel("2026-06-24", "2026-06-19"), "in 5 days");
  assert.equal(countdownLabel("2026-06-16", "2026-06-19"), "3 days ago");
});
