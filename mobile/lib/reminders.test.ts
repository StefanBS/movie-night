import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatRemindersSummary,
  parseReminders,
  reminderConfirmation,
  sameReminders,
  type Reminders,
} from "./reminders";

const r = (nightBefore: boolean, morningOf: boolean, audience: Reminders["audience"] = "everyone"): Reminders => ({
  nightBefore,
  morningOf,
  audience,
});

test("parseReminders accepts a valid payload and rejects a malformed one", () => {
  assert.deepEqual(parseReminders({ nightBefore: true, morningOf: false, audience: "picker" }), r(true, false, "picker"));
  const bad: { name: string; raw: unknown }[] = [
    { name: "null", raw: null },
    { name: "missing nightBefore", raw: { morningOf: true, audience: "everyone" } },
    { name: "string morningOf", raw: { nightBefore: true, morningOf: "yes", audience: "everyone" } },
    { name: "unknown audience", raw: { nightBefore: true, morningOf: true, audience: "all" } },
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
});

test("formatRemindersSummary names the slots that are on", () => {
  const cases: { reminders: Reminders; want: string }[] = [
    { reminders: r(true, true), want: "Night before, morning of" },
    { reminders: r(true, false), want: "Night before" },
    { reminders: r(false, true), want: "Morning of" },
    { reminders: r(false, false), want: "Off" },
    { reminders: r(false, false, "picker"), want: "Off" },
  ];
  for (const c of cases) {
    assert.equal(formatRemindersSummary(c.reminders), c.want);
  }
});

test("reminderConfirmation describes who and when", () => {
  const cases: { reminders: Reminders; want: { title: string; body: string } }[] = [
    {
      reminders: r(true, true),
      want: { title: "Reminder set", body: "We'll nudge everyone the night before and the morning of." },
    },
    {
      reminders: r(false, true, "picker"),
      want: { title: "Reminder set", body: "We'll nudge just the picker the morning of." },
    },
    {
      reminders: r(true, false),
      want: { title: "Reminder set", body: "We'll nudge everyone the night before." },
    },
    {
      reminders: r(false, false),
      want: { title: "Reminders off", body: "The picker still gets their nudge." },
    },
  ];
  for (const c of cases) {
    assert.deepEqual(reminderConfirmation(c.reminders), c.want);
  }
});
