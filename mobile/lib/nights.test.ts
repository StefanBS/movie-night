import { test } from "node:test";
import assert from "node:assert/strict";

import { parseNight, parseNights } from "./nights";

const valid = {
  id: "n1",
  scheduledFor: "2026-06-12",
  movie: null,
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

test("parseNights parses an array of nights", () => {
  const ns = parseNights([valid, { id: "n2", scheduledFor: "2026-07-01", attendees: [] }]);
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

import { nextScheduledNight, type Night } from "./nights";

const TODAY = "2026-06-22";
const aMovie = { tmdbId: 1, title: "Dune", releaseYear: 2021, posterUrl: "https://img/x.jpg" };

function night(id: string, scheduledFor: string, opts: Partial<Night> = {}): Night {
  return { id, scheduledFor, pickerId: "u1", movie: null, attendees: [], ...opts };
}

test("nextScheduledNight returns null for no nights", () => {
  assert.equal(nextScheduledNight([], TODAY), null);
});

test("nextScheduledNight ignores past nights", () => {
  assert.equal(nextScheduledNight([night("n1", "2026-06-20")], TODAY), null);
});

test("nextScheduledNight ignores future nights with a movie attached", () => {
  assert.equal(nextScheduledNight([night("n1", "2026-06-26", { movie: aMovie })], TODAY), null);
});

test("nextScheduledNight returns a single upcoming planned night", () => {
  assert.equal(nextScheduledNight([night("n1", "2026-06-26")], TODAY)?.id, "n1");
});

test("nextScheduledNight returns the soonest of several planned nights", () => {
  const n = nextScheduledNight(
    [night("far", "2026-07-10"), night("soon", "2026-06-26"), night("mid", "2026-06-30")],
    TODAY,
  );
  assert.equal(n?.id, "soon");
});

test("nextScheduledNight includes a night scheduled for today", () => {
  assert.equal(nextScheduledNight([night("n1", TODAY)], TODAY)?.id, "n1");
});

test("nextScheduledNight skips past/recorded and picks the soonest upcoming planned", () => {
  const n = nextScheduledNight(
    [
      night("past", "2026-06-10", { movie: aMovie }),
      night("recorded-future", "2026-06-28", { movie: aMovie }),
      night("planned", "2026-07-01"),
    ],
    TODAY,
  );
  assert.equal(n?.id, "planned");
});
