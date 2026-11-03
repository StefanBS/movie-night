import { test } from "node:test";
import assert from "node:assert/strict";

import {
  countdownLabel,
  daysUntil,
  formatMonthYear,
  formatShortDateYear,
  formatShortDate,
  formatStartTime,
  formatWeekdayDate,
  formatWeekdayDayMonth,
  nightSummary,
  relativeLabel,
  startTimeDate,
  startTimeMinus,
  todayLocalISO,
  toStartTime,
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

test("formatShortDateYear renders a day-month-year label without a comma", () => {
  assert.equal(formatShortDateYear("2025-09-12"), "Sep 12 2025");
  assert.equal(formatShortDateYear("2026-01-03"), "Jan 3 2026");
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

const weekdayDayMonthCases: [string, string, string][] = [
  ["a Saturday in June", "2026-06-27", "Sat 27 Jun"],
  ["no zero-padded day", "2026-01-05", "Mon 5 Jan"],
  ["a December date", "2025-12-31", "Wed 31 Dec"],
];
for (const [name, iso, want] of weekdayDayMonthCases) {
  test(`formatWeekdayDayMonth: ${name}`, () => {
    assert.equal(formatWeekdayDayMonth(iso), want);
  });
}

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

test("formatStartTime follows the locale's 12- or 24-hour clock", () => {
  const cases: { hhmm: string; locale: string; want: string }[] = [
    { hhmm: "19:30", locale: "en-US", want: "7:30 PM" },
    { hhmm: "09:05", locale: "en-US", want: "9:05 AM" },
    { hhmm: "00:00", locale: "en-US", want: "12:00 AM" },
    { hhmm: "19:30", locale: "en-GB", want: "19:30" },
    { hhmm: "09:05", locale: "en-GB", want: "09:05" },
  ];
  for (const c of cases) {
    assert.equal(formatStartTime(c.hhmm, c.locale), c.want, `${c.hhmm} ${c.locale}`);
  }
});

test("startTimeDate and toStartTime convert between HH:MM and a local Date", () => {
  const d = startTimeDate("20:15", new Date(2026, 10, 6, 8, 0, 42));
  assert.deepEqual(d, new Date(2026, 10, 6, 20, 15));
  assert.equal(toStartTime(new Date(2026, 10, 6, 7, 5, 59)), "07:05");
  assert.equal(toStartTime(startTimeDate("23:59")), "23:59");
});

test("startTimeMinus counts back across midnight", () => {
  assert.equal(startTimeMinus("19:30", 120), "17:30");
  assert.equal(startTimeMinus("01:00", 120), "23:00");
  assert.equal(startTimeMinus("02:00", 120), "00:00");
});

test("nightSummary is the weekday date, the start time when set, and a countdown only ahead", () => {
  const today = "2026-06-15";
  const cases: { name: string; iso: string; startTime: string | null; want: string }[] = [
    { name: "ahead with a time", iso: "2026-06-19", startTime: "20:00", want: "Friday, Jun 19 · 8:00 PM · in 4 days" },
    { name: "ahead without a time", iso: "2026-06-19", startTime: null, want: "Friday, Jun 19 · in 4 days" },
    { name: "tomorrow", iso: "2026-06-16", startTime: "19:30", want: "Tuesday, Jun 16 · 7:30 PM · tomorrow" },
    { name: "tonight has no countdown", iso: "2026-06-15", startTime: "20:00", want: "Monday, Jun 15 · 8:00 PM" },
    { name: "tonight without a time", iso: "2026-06-15", startTime: null, want: "Monday, Jun 15" },
    { name: "a past night has no countdown", iso: "2026-06-12", startTime: null, want: "Friday, Jun 12" },
  ];
  for (const c of cases) {
    assert.equal(nightSummary(c.iso, c.startTime, today, "en-US").join(" · "), c.want, c.name);
  }
});

test("nightSummary uses the locale's clock for the start time", () => {
  assert.equal(
    nightSummary("2026-06-19", "20:00", "2026-06-15", "en-GB").join(" · "),
    "Friday, Jun 19 · 20:00 · in 4 days",
  );
});
