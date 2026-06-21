import { test } from "node:test";
import assert from "node:assert/strict";

import { dayState, monthGrid, nightDates, shiftMonth } from "./calendar";
import type { Night } from "./nights";

// monthGrid — built from local-time Date components, so timezone-independent.
test("monthGrid: a month starting on Sunday has no leading blanks", () => {
  // 2026-02-01 is a Sunday.
  const cells = monthGrid(2026, 2);
  assert.equal(cells[0]?.iso, "2026-02-01");
  assert.equal(cells.length, 28); // 0 blanks + 28 days (non-leap)
});

test("monthGrid: leading blanks equal the weekday of the 1st", () => {
  // 2026-06-01 is a Monday → 1 leading blank.
  const cells = monthGrid(2026, 6);
  assert.equal(cells[0], null);
  assert.equal(cells[1]?.iso, "2026-06-01");
  assert.equal(cells.length, 1 + 30);
});

test("monthGrid: a month starting on Saturday has six leading blanks", () => {
  // 2026-08-01 is a Saturday → 6 blanks.
  const cells = monthGrid(2026, 8);
  assert.deepEqual(cells.slice(0, 6), [null, null, null, null, null, null]);
  assert.equal(cells[6]?.iso, "2026-08-01");
});

test("monthGrid: February 2024 is a leap month (29 days)", () => {
  const days = monthGrid(2024, 2).filter((c) => c !== null);
  assert.equal(days.length, 29);
  assert.equal(days[days.length - 1]?.iso, "2024-02-29");
});

test("monthGrid: zero-pads month and day in the ISO", () => {
  const cells = monthGrid(2026, 6).filter((c) => c !== null);
  assert.equal(cells[0]?.iso, "2026-06-01");
  assert.equal(cells[8]?.iso, "2026-06-09");
});

// shiftMonth
test("shiftMonth: +1 within the year", () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 6 }, 1), { year: 2026, month: 7 });
});
test("shiftMonth: -1 within the year", () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 6 }, -1), { year: 2026, month: 5 });
});
test("shiftMonth: December +1 rolls to next January", () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
});
test("shiftMonth: January -1 rolls to previous December", () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
});

// nightDates
const night = (scheduledFor: string): Night => ({
  id: scheduledFor,
  scheduledFor,
  pickerId: null,
  movie: null,
  attendees: [],
});
test("nightDates: empty list → empty set", () => {
  assert.equal(nightDates([]).size, 0);
});
test("nightDates: collapses duplicate dates and keeps distinct ones", () => {
  const set = nightDates([night("2026-06-19"), night("2026-06-19"), night("2026-06-26")]);
  assert.equal(set.size, 2);
  assert.ok(set.has("2026-06-19"));
  assert.ok(set.has("2026-06-26"));
});

// dayState
const today = "2026-06-20";
const dates = new Set(["2026-06-26"]);
test("dayState: selected", () => {
  const s = dayState("2026-06-22", { selected: "2026-06-22", today, nightDates: dates });
  assert.deepEqual(s, { selected: true, today: false, hasNight: false, past: false });
});
test("dayState: selected === today — today flag is NOT suppressed by selection", () => {
  const s = dayState("2026-06-20", { selected: "2026-06-20", today, nightDates: dates });
  assert.deepEqual(s, { selected: true, today: true, hasNight: false, past: false });
});
test("dayState: past night date has both hasNight and past", () => {
  const s = dayState("2026-06-10", {
    selected: "",
    today,
    nightDates: new Set(["2026-06-10"]),
  });
  assert.deepEqual(s, { selected: false, today: false, hasNight: true, past: true });
});
test("dayState: today (unselected) is today and not past", () => {
  const s = dayState(today, { selected: "2026-06-22", today, nightDates: dates });
  assert.deepEqual(s, { selected: false, today: true, hasNight: false, past: false });
});
test("dayState: a night date shows hasNight", () => {
  const s = dayState("2026-06-26", { selected: "2026-06-22", today, nightDates: dates });
  assert.equal(s.hasNight, true);
});
test("dayState: hasNight is suppressed when the night date is also selected", () => {
  const s = dayState("2026-06-26", { selected: "2026-06-26", today, nightDates: dates });
  assert.equal(s.selected, true);
  assert.equal(s.hasNight, false);
});
test("dayState: yesterday is past, today is not", () => {
  assert.equal(dayState("2026-06-19", { selected: "", today, nightDates: dates }).past, true);
  assert.equal(dayState("2026-06-20", { selected: "", today, nightDates: dates }).past, false);
  assert.equal(dayState("2026-06-21", { selected: "", today, nightDates: dates }).past, false);
});
