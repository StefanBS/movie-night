import { test } from "node:test";
import assert from "node:assert/strict";

import { buildClubSections, clubSummary, memberPicks, memberProfile, memberSince, noPicksLine, ordinal } from "./club";
import type { Member } from "./members";
import type { Night } from "./nights";
import type { TurnMember } from "./turn";

const members: Member[] = [
  { id: "a", name: "Ada", role: "core", status: "active", joinedOn: "2024-01-01" },
  { id: "b", name: "Bo", role: "core", status: "active", joinedOn: "2024-02-01" },
  { id: "g", name: "Gus", role: "guest", status: "active", joinedOn: "2024-03-01" },
  { id: "z", name: "Zed", role: "core", status: "inactive", joinedOn: "2023-01-01" },
];
const turn: TurnMember[] = [
  { id: "a", name: "Ada", role: "core", servedCount: 0, lastPickedOn: null },
  { id: "b", name: "Bo", role: "core", servedCount: 2, lastPickedOn: "2026-05-30" },
];

test("buildClubSections splits into rotation, guests, inactive", () => {
  const s = buildClubSections(members, turn);
  assert.deepEqual(s.inRotation, turn);
  assert.deepEqual(s.guests.map((m) => m.id), ["g"]);
  assert.deepEqual(s.inactive.map((m) => m.id), ["z"]);
});

test("clubSummary counts active members and the rotation", () => {
  assert.equal(clubSummary(members, turn), "3 members · 2 in rotation");
});

test("clubSummary uses the singular for one member", () => {
  const one: Member[] = [members[0]];
  const t1: TurnMember[] = [turn[0]];
  assert.equal(clubSummary(one, t1), "1 member · 1 in rotation");
});

test("memberProfile resolves an in-rotation member with rank", () => {
  const p = memberProfile(members, turn, "b");
  assert.equal(p?.member.id, "b");
  assert.equal(p?.turn?.servedCount, 2);
  assert.equal(p?.rank, 2);
});

test("memberProfile resolves a guest with null turn and rank", () => {
  const p = memberProfile(members, turn, "g");
  assert.equal(p?.member.id, "g");
  assert.equal(p?.turn, null);
  assert.equal(p?.rank, null);
});

test("memberProfile returns null when the id is unknown", () => {
  assert.equal(memberProfile(members, turn, "nope"), null);
});

const ordinalCases: [number, string][] = [
  [1, "1st"],
  [2, "2nd"],
  [3, "3rd"],
  [4, "4th"],
  [11, "11th"],
  [12, "12th"],
  [13, "13th"],
  [21, "21st"],
  [22, "22nd"],
  [101, "101st"],
  [111, "111th"],
];
for (const [n, want] of ordinalCases) {
  test(`ordinal: ${n} is ${want}`, () => {
    assert.equal(ordinal(n), want);
  });
}

const sinceCases: [string, Member, string][] = [
  ["core, one-word name", members[0], "Core since Jan 2024"],
  ["guest, one-word name", members[2], "Guest since Mar 2024"],
  ["full name", { ...members[0], name: "Ada Lovelace" }, "Ada Lovelace · core since Jan 2024"],
];
for (const [name, member, want] of sinceCases) {
  test(`memberSince: ${name}`, () => {
    assert.equal(memberSince(member), want);
  });
}

const TODAY = "2026-06-22";
function night(id: string, scheduledFor: string, pickerId: string): Night {
  return {
    id,
    scheduledFor,
    startTime: null,
    pickerId,
    movie: null,
    attendees: [],
    reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
  };
}
const nights: Night[] = [
  night("old", "2026-05-01", "a"),
  night("bo", "2026-06-01", "b"),
  night("recent", "2026-06-15", "a"),
  night("tonight", TODAY, "a"),
  night("ahead", "2026-06-30", "a"),
];

const picksCases: [string, string, string[]][] = [
  ["their past nights and tonight, newest first", "a", ["tonight", "recent", "old"]],
  ["only their own", "b", ["bo"]],
  ["nobody's picks", "g", []],
];
for (const [name, id, want] of picksCases) {
  test(`memberPicks: ${name}`, () => {
    assert.deepEqual(memberPicks(nights, id, TODAY).map((n) => n.id), want);
  });
}

const noPicksCases: [string, number | null, string][] = [
  ["next up", 1, "No picks yet. Ada is next up, so the first one is coming."],
  ["later in line", 3, "No picks yet. Ada is 3rd in line."],
  ["not in the rotation", null, "No picks yet."],
];
for (const [name, rank, want] of noPicksCases) {
  test(`noPicksLine: ${name}`, () => {
    assert.equal(noPicksLine("Ada Lovelace", rank), want);
  });
}
