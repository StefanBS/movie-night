import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatRemindersSummary,
  parseReminders,
  reminderConfirmation,
  sameReminders,
  type Reminders,
} from "./reminders";

const r = (
  nightBefore: boolean,
  morningOf: boolean,
  audience: Reminders["audience"] = "everyone",
  twoHoursBefore = false,
): Reminders => ({
  nightBefore,
  morningOf,
  twoHoursBefore,
  audience,
});
const all = (audience: Reminders["audience"] = "everyone") => r(true, true, audience, true);

test("parseReminders accepts a valid payload and rejects a malformed one", () => {
  assert.deepEqual(
    parseReminders({ nightBefore: true, morningOf: false, twoHoursBefore: true, audience: "picker" }),
    r(true, false, "picker", true),
  );
  const bad: { name: string; raw: unknown }[] = [
    { name: "null", raw: null },
    { name: "missing nightBefore", raw: { morningOf: true, twoHoursBefore: true, audience: "everyone" } },
    { name: "string morningOf", raw: { nightBefore: true, morningOf: "yes", twoHoursBefore: true, audience: "everyone" } },
    { name: "missing twoHoursBefore", raw: { nightBefore: true, morningOf: true, audience: "everyone" } },
    { name: "unknown audience", raw: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "all" } },
  ];
  for (const c of bad) {
    assert.throws(() => parseReminders(c.raw), c.name);
  }
});

test("sameReminders compares every setting", () => {
  assert.equal(sameReminders(r(true, true), r(true, true)), true);
  assert.equal(sameReminders(r(true, true), r(false, true)), false);
  assert.equal(sameReminders(r(true, true), r(true, false)), false);
  assert.equal(sameReminders(r(true, true), r(true, true, "picker")), false);
  assert.equal(sameReminders(r(true, true), all()), false);
});

test("formatRemindersSummary names the slots that are on", () => {
  // 2 hours before only counts on a Night with a start time.
  const cases: { reminders: Reminders; startTime: string | null; want: string }[] = [
    { reminders: r(true, true), startTime: null, want: "Night before, morning of" },
    { reminders: r(true, false), startTime: null, want: "Night before" },
    { reminders: r(false, true), startTime: null, want: "Morning of" },
    { reminders: r(false, false), startTime: null, want: "Off" },
    { reminders: r(false, false, "picker"), startTime: null, want: "Off" },
    { reminders: all(), startTime: "19:30", want: "Night before, morning of, 2 hours before" },
    { reminders: all(), startTime: null, want: "Night before, morning of" },
    { reminders: r(false, false, "everyone", true), startTime: "19:30", want: "2 hours before" },
    { reminders: r(false, false, "everyone", true), startTime: null, want: "Off" },
  ];
  for (const c of cases) {
    assert.equal(formatRemindersSummary(c.reminders, c.startTime), c.want);
  }
});

test("reminderConfirmation describes who and when", () => {
  const cases: { reminders: Reminders; startTime: string | null; want: { title: string; body: string } }[] = [
    {
      reminders: r(true, true),
      startTime: null,
      want: { title: "Reminder set", body: "We'll nudge everyone the night before and the morning of." },
    },
    {
      reminders: r(false, true, "picker"),
      startTime: null,
      want: { title: "Reminder set", body: "We'll nudge just the picker the morning of." },
    },
    {
      reminders: r(true, false),
      startTime: null,
      want: { title: "Reminder set", body: "We'll nudge everyone the night before." },
    },
    {
      reminders: r(false, false),
      startTime: null,
      want: { title: "Reminders off", body: "The picker still gets their nudge." },
    },
    {
      reminders: all(),
      startTime: "19:30",
      want: { title: "Reminder set", body: "We'll nudge everyone the night before, the morning of and 2 hours before." },
    },
    {
      reminders: r(false, false, "picker", true),
      startTime: "19:30",
      want: { title: "Reminder set", body: "We'll nudge just the picker 2 hours before." },
    },
    {
      reminders: r(false, false, "everyone", true),
      startTime: null,
      want: { title: "Reminders off", body: "The picker still gets their nudge." },
    },
  ];
  for (const c of cases) {
    assert.deepEqual(reminderConfirmation(c.reminders, c.startTime), c.want);
  }
});
