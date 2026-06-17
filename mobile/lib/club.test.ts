import { test } from "node:test";
import assert from "node:assert/strict";

import { buildClubSections, clubSummary, memberProfile } from "./club";
import type { Member } from "./members";
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
