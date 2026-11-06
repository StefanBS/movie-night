import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatRepeatLabel,
  formatRepeatShort,
  parseRepeat,
  reconcileRepeat,
  repeatOptions,
  sameRepeat,
  seriesDates,
  type Repeat,
} from "./repeat";

const weekly: Repeat = { freq: "weekly", intervalWeeks: 1 };
const fortnightly: Repeat = { freq: "weekly", intervalWeeks: 2 };
const monthly = (week: 1 | 2 | 3 | 4 | -1): Repeat => ({ freq: "monthly", week });

test("parseRepeat reads each repeat, or none, and rejects a malformed one", () => {
  const good: { raw: unknown; want: Repeat | null }[] = [
    { raw: null, want: null },
    { raw: undefined, want: null },
    { raw: { freq: "weekly", intervalWeeks: 1 }, want: weekly },
    { raw: { freq: "monthly", week: 3 }, want: monthly(3) },
    { raw: { freq: "monthly", week: -1 }, want: monthly(-1) },
  ];
  for (const c of good) {
    assert.deepEqual(parseRepeat(c.raw), c.want, JSON.stringify(c.raw));
  }
  const bad: { name: string; raw: unknown }[] = [
    { name: "a string", raw: "weekly" },
    { name: "unknown freq", raw: { freq: "daily" } },
    { name: "weekly every 3 weeks", raw: { freq: "weekly", intervalWeeks: 3 } },
    { name: "monthly fifth week", raw: { freq: "monthly", week: 5 } },
    { name: "monthly week as a string", raw: { freq: "monthly", week: "3" } },
  ];
  for (const c of bad) {
    assert.throws(() => parseRepeat(c.raw), c.name);
  }
});

test("sameRepeat compares by value", () => {
  const cases: { a: Repeat | null; b: Repeat | null; want: boolean }[] = [
    { a: null, b: null, want: true },
    { a: weekly, b: { freq: "weekly", intervalWeeks: 1 }, want: true },
    { a: weekly, b: fortnightly, want: false },
    { a: weekly, b: null, want: false },
    { a: monthly(4), b: monthly(-1), want: false },
    { a: monthly(3), b: monthly(3), want: true },
  ];
  for (const c of cases) {
    assert.equal(sameRepeat(c.a, c.b), c.want, `${JSON.stringify(c.a)} vs ${JSON.stringify(c.b)}`);
  }
});

test("formatRepeatLabel names the cadence on the night's weekday", () => {
  const cases: { repeat: Repeat | null; date: string; want: string }[] = [
    { repeat: null, date: "2026-06-19", want: "Doesn't repeat" },
    { repeat: weekly, date: "2026-06-19", want: "Every Friday" },
    { repeat: fortnightly, date: "2026-06-19", want: "Every 2 weeks" },
    { repeat: monthly(3), date: "2026-06-19", want: "Third Friday of the month" },
    { repeat: monthly(-1), date: "2026-06-26", want: "Last Friday of the month" },
  ];
  for (const c of cases) {
    assert.equal(formatRepeatLabel(c.repeat, c.date), c.want, JSON.stringify(c));
  }
});

test("formatRepeatShort is the cadence alone, for a line that already has the date", () => {
  const cases: { repeat: Repeat; want: string }[] = [
    { repeat: weekly, want: "Weekly" },
    { repeat: fortnightly, want: "Every 2 weeks" },
    { repeat: monthly(3), want: "Monthly" },
  ];
  for (const c of cases) {
    assert.equal(formatRepeatShort(c.repeat), c.want, JSON.stringify(c.repeat));
  }
});

test("repeatOptions offers the four choices for the night's date", () => {
  const options = repeatOptions("2026-06-19", null);
  assert.deepEqual(
    options.map(({ label, note, repeat }) => ({ label, note, repeat })),
    [
      { label: "Doesn't repeat", note: "A one-off night", repeat: null },
      { label: "Every week", note: "Fridays", repeat: weekly },
      { label: "Every 2 weeks", note: "Fridays", repeat: fortnightly },
      { label: "Every month", note: "Third Friday", repeat: monthly(3) },
    ],
  );
});

test("repeatOptions' monthly choice follows the date's week of the month", () => {
  const cases: { name: string; date: string; current: Repeat | null; want: Repeat; note: string }[] = [
    { name: "a 5th weekday is the last", date: "2026-07-31", current: null, want: monthly(-1), note: "Last Friday" },
    { name: "a 4th weekday is the fourth", date: "2026-06-26", current: null, want: monthly(4), note: "Fourth Friday" },
    { name: "a 4th weekday kept as the last", date: "2026-06-26", current: monthly(-1), want: monthly(-1), note: "Last Friday" },
    { name: "a stale week follows the date", date: "2026-06-19", current: monthly(-1), want: monthly(3), note: "Third Friday" },
  ];
  for (const c of cases) {
    const option = repeatOptions(c.date, c.current)[3];
    assert.deepEqual(option.repeat, c.want, c.name);
    assert.equal(option.note, c.note, c.name);
  }
});

test("reconcileRepeat keeps a rule in step when the night's date moves", () => {
  const cases: { name: string; repeat: Repeat | null; date: string; want: Repeat | null }[] = [
    { name: "none stays none", repeat: null, date: "2026-06-20", want: null },
    { name: "weekly follows any date", repeat: weekly, date: "2026-06-20", want: weekly },
    { name: "monthly still matching is kept", repeat: monthly(3), date: "2026-07-17", want: monthly(3) },
    { name: "monthly on another week moves to it", repeat: monthly(3), date: "2026-06-26", want: monthly(4) },
    { name: "last kept while still the last", repeat: monthly(-1), date: "2026-07-31", want: monthly(-1) },
    { name: "last moved off the end becomes its week", repeat: monthly(-1), date: "2026-07-10", want: monthly(2) },
  ];
  for (const c of cases) {
    assert.deepEqual(reconcileRepeat(c.repeat, c.date), c.want, c.name);
  }
});

test("seriesDates previews the night and the dates after it", () => {
  const cases: { name: string; repeat: Repeat | null; date: string; want: string[] }[] = [
    { name: "a one-off is just its night", repeat: null, date: "2026-06-19", want: ["2026-06-19"] },
    { name: "every week, into July", repeat: weekly, date: "2026-06-19", want: ["2026-06-19", "2026-06-26", "2026-07-03", "2026-07-10"] },
    { name: "every 2 weeks", repeat: fortnightly, date: "2026-06-19", want: ["2026-06-19", "2026-07-03", "2026-07-17", "2026-07-31"] },
    { name: "third Friday, into the next year", repeat: monthly(3), date: "2026-11-20", want: ["2026-11-20", "2026-12-18", "2027-01-15", "2027-02-19"] },
    { name: "last Friday", repeat: monthly(-1), date: "2026-06-26", want: ["2026-06-26", "2026-07-31", "2026-08-28", "2026-09-25"] },
  ];
  for (const c of cases) {
    assert.deepEqual(seriesDates(c.repeat, c.date, 4), c.want, c.name);
  }
});
