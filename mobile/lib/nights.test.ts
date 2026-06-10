import { test } from "node:test";
import assert from "node:assert/strict";

import { parseNight } from "./nights";

const valid = {
  id: "n1",
  scheduledFor: "2026-06-12",
  attendees: [
    { id: "u1", name: "Ada", role: "core" },
    { id: "u6", name: "Frankie", role: "guest" },
  ],
};

test("parses a valid night with attendees", () => {
  const n = parseNight(valid);
  assert.equal(n.id, "n1");
  assert.equal(n.scheduledFor, "2026-06-12");
  assert.equal(n.attendees.length, 2);
  assert.equal(n.attendees[1].role, "guest");
});

test("parses a night with no attendees", () => {
  const n = parseNight({ id: "n1", scheduledFor: "2026-06-12", attendees: [] });
  assert.deepEqual(n.attendees, []);
});

test("rejects a bad attendee role", () => {
  assert.throws(
    () => parseNight({ ...valid, attendees: [{ id: "u1", name: "Ada", role: "admin" }] }),
    /role/,
  );
});

test("rejects non-array attendees", () => {
  assert.throws(() => parseNight({ id: "n1", scheduledFor: "2026-06-12", attendees: {} }), /attendees/);
});

test("rejects a non-object", () => {
  assert.throws(() => parseNight(null), /night object/);
});

test("rejects a non-string id", () => {
  assert.throws(() => parseNight({ id: 42, scheduledFor: "2026-06-12", attendees: [] }), /id/);
});

test("rejects a non-string scheduledFor", () => {
  assert.throws(() => parseNight({ id: "n1", scheduledFor: 99, attendees: [] }), /scheduledFor/);
});

test("parseNight reads a set pickerId", () => {
  const n = parseNight({
    id: "n1",
    scheduledFor: "2026-06-12",
    pickerId: "u1",
    attendees: [],
  });
  assert.equal(n.pickerId, "u1");
});

test("parseNight accepts a null pickerId", () => {
  const n = parseNight({
    id: "n1",
    scheduledFor: "2026-06-12",
    pickerId: null,
    attendees: [],
  });
  assert.equal(n.pickerId, null);
});

test("parseNight rejects a non-string, non-null pickerId", () => {
  assert.throws(
    () => parseNight({ id: "n1", scheduledFor: "2026-06-12", pickerId: 7, attendees: [] }),
    /pickerId/,
  );
});
