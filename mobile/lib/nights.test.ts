import { test } from "node:test";
import assert from "node:assert/strict";

import { parseNight, parseNights } from "./nights";

const reminders = { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" };

const valid = {
  id: "n1",
  scheduledFor: "2026-06-12",
  pickerId: "u1",
  movie: null,
  attendees: [
    { id: "u1", name: "Ada", role: "core" },
    { id: "u6", name: "Frankie", role: "guest" },
  ],
  reminders,
};

test("parses a valid night with attendees", () => {
  const n = parseNight(valid);
  assert.equal(n.id, "n1");
  assert.equal(n.scheduledFor, "2026-06-12");
  assert.equal(n.attendees.length, 2);
  assert.equal(n.attendees[1].role, "guest");
});

test("parses a night's start time, or none", () => {
  assert.equal(parseNight(valid).startTime, null);
  assert.equal(parseNight({ ...valid, startTime: null }).startTime, null);
  assert.equal(parseNight({ ...valid, startTime: "19:30" }).startTime, "19:30");
  assert.throws(() => parseNight({ ...valid, startTime: 1930 }), /startTime/);
  assert.throws(() => parseNight({ ...valid, startTime: "7:30 PM" }), /startTime/);
});

test("parses a night with no attendees", () => {
  const n = parseNight({ id: "n1", scheduledFor: "2026-06-12", pickerId: "u1", attendees: [], reminders });
  assert.deepEqual(n.attendees, []);
});

test("rejects a bad attendee role", () => {
  assert.throws(
    () => parseNight({ ...valid, attendees: [{ id: "u1", name: "Ada", role: "admin" }] }),
    /role/,
  );
});

test("rejects non-array attendees", () => {
  assert.throws(() => parseNight({ id: "n1", scheduledFor: "2026-06-12", pickerId: "u1", attendees: {} }), /attendees/);
});

test("rejects a non-object", () => {
  assert.throws(() => parseNight(null), /night object/);
});

test("rejects a non-string id", () => {
  assert.throws(() => parseNight({ id: 42, scheduledFor: "2026-06-12", pickerId: "u1", attendees: [] }), /id/);
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
    reminders,
  });
  assert.equal(n.pickerId, "u1");
});

test("parseNight rejects a missing or null pickerId (every Night has a picker)", () => {
  for (const pickerId of [undefined, null, 7]) {
    assert.throws(
      () => parseNight({ id: "n1", scheduledFor: "2026-06-12", pickerId, attendees: [] }),
      /pickerId/,
    );
  }
});

test("parseNight reads an attached movie", () => {
  const n = parseNight({
    ...valid,
    movie: { tmdbId: 438631, title: "Dune", releaseYear: 2021, posterUrl: "https://img/x.jpg" },
  });
  assert.deepEqual(n.movie, { tmdbId: 438631, title: "Dune", releaseYear: 2021, posterUrl: "https://img/x.jpg" });
});

test("parseNight accepts a null or absent movie", () => {
  assert.equal(parseNight({ ...valid, movie: null }).movie, null);
  assert.equal(parseNight(valid).movie, null);
});

test("parseNight rejects a bad movie shape", () => {
  assert.throws(() => parseNight({ ...valid, movie: { tmdbId: "x", title: "Dune" } }), /tmdbId/);
});

test("parseNight reads the reminder settings and rejects missing ones", () => {
  assert.deepEqual(parseNight(valid).reminders, reminders);
  assert.throws(() => parseNight({ ...valid, reminders: undefined }), /reminders/);
});

test("parseNights parses an array of nights", () => {
  const ns = parseNights([valid, { id: "n2", scheduledFor: "2026-07-01", pickerId: "u2", attendees: [], reminders }]);
  assert.equal(ns.length, 2);
  assert.equal(ns[0].id, "n1");
  assert.equal(ns[1].id, "n2");
});

test("parseNights accepts an empty array", () => {
  assert.deepEqual(parseNights([]), []);
});

test("parseNights rejects a non-array", () => {
  assert.throws(() => parseNights({}), /array of nights/);
});

test("parseNights rejects a malformed element", () => {
  assert.throws(() => parseNights([valid, { id: 5 }]), /id/);
});
