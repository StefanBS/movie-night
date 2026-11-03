import { test } from "node:test";
import assert from "node:assert/strict";

import { editRows, isDirty, type Draft } from "./nightEdit";
import type { Member } from "./members";
import type { Night } from "./nights";

const member = (id: string, role: Member["role"], status: Member["status"] = "active"): Member => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  role,
  status,
  joinedOn: "2026-01-01",
});

const ROSTER: Member[] = [
  member("ada", "core"),
  member("blake", "core"),
  member("frankie", "guest"),
  member("zed", "core", "inactive"),
];

const night = (...ids: string[]): Night => ({
  id: "n1",
  scheduledFor: "2026-06-26",
  startTime: null,
  pickerId: ids[0],
  reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
  watchedAt: null,
  repeat: null,
  movie: null,
  attendees: ids.map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1), role: id === "frankie" ? "guest" : "core" })),
});

test("editRows lists active core members, then every other attendee", () => {
  const cases: { name: string; night: Night; want: string[] }[] = [
    { name: "core only", night: night("ada"), want: ["ada", "blake"] },
    { name: "a guest attendee is listed after core", night: night("ada", "frankie"), want: ["ada", "blake", "frankie"] },
    { name: "an inactive attendee is listed", night: night("ada", "zed"), want: ["ada", "blake", "zed"] },
    { name: "a guest picker is listed", night: night("frankie"), want: ["ada", "blake", "frankie"] },
  ];
  for (const c of cases) {
    assert.deepEqual(
      editRows(c.night, ROSTER).map((r) => r.id),
      c.want,
      c.name,
    );
  }
});

test("editRows names attendees who left the roster from the Night itself", () => {
  const rows = editRows(night("ada", "frankie"), [member("ada", "core")]);
  assert.deepEqual(rows, [
    { id: "ada", name: "Ada" },
    { id: "frankie", name: "Frankie" },
  ]);
});

test("isDirty is false until the draft differs from the stored Night", () => {
  const stored: Night = { ...night("ada", "blake"), startTime: "20:00" };
  const clean: Draft = {
    date: stored.scheduledFor,
    startTime: stored.startTime,
    attendees: new Set(["ada", "blake"]),
    reminders: stored.reminders,
    repeat: stored.repeat,
  };
  const cases: { name: string; draft: Partial<Draft>; want: boolean }[] = [
    { name: "unchanged", draft: {}, want: false },
    { name: "same attendees in another order", draft: { attendees: new Set(["blake", "ada"]) }, want: false },
    { name: "an equal reminders copy", draft: { reminders: { ...stored.reminders } }, want: false },
    { name: "another date", draft: { date: "2026-06-27" }, want: true },
    { name: "another start time", draft: { startTime: "19:30" }, want: true },
    { name: "set to repeat", draft: { repeat: { freq: "weekly", intervalWeeks: 1 } }, want: true },
    { name: "start time cleared", draft: { startTime: null }, want: true },
    { name: "someone added", draft: { attendees: new Set(["ada", "blake", "frankie"]) }, want: true },
    { name: "someone removed", draft: { attendees: new Set(["ada"]) }, want: true },
    { name: "someone swapped (same count)", draft: { attendees: new Set(["ada", "frankie"]) }, want: true },
    { name: "reminders changed", draft: { reminders: { ...stored.reminders, morningOf: false } }, want: true },
  ];
  for (const c of cases) {
    assert.equal(isDirty(stored, { ...clean, ...c.draft }), c.want, c.name);
  }
});
