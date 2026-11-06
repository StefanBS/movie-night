import { test } from "node:test";
import assert from "node:assert/strict";

import { nightPicker, parseNight, parseNights, type Night } from "./nights";

const reminders = { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" };

const valid = {
  id: "n1",
  scheduledFor: "2026-06-12",
  startTime: null,
  pickerId: "u1",
  movie: null,
  attendees: [
    { id: "u1", name: "Ada" },
    { id: "u6", name: "Frankie" },
  ],
  reminders,
  watchedAt: null,
  repeat: null,
};

test("parses a valid night with attendees", () => {
  const n = parseNight(valid);
  assert.equal(n.id, "n1");
  assert.equal(n.scheduledFor, "2026-06-12");
  assert.equal(n.attendees.length, 2);
  assert.equal(n.attendees[1].name, "Frankie");
});

test("parses a night's start time, or none", () => {
  assert.equal(parseNight(valid).startTime, null);
  assert.equal(parseNight({ ...valid, startTime: "19:30" }).startTime, "19:30");
  assert.throws(() => parseNight({ ...valid, startTime: 1930 }), /startTime/);
  assert.throws(() => parseNight({ ...valid, startTime: "7:30 PM" }), /startTime/);
});

test("parses when a night was watched, or not yet", () => {
  assert.equal(parseNight(valid).watchedAt, null);
  assert.equal(parseNight({ ...valid, watchedAt: "2026-06-12T22:41:07Z" }).watchedAt, "2026-06-12T22:41:07Z");
  assert.throws(() => parseNight({ ...valid, watchedAt: true }), /watchedAt/);
});

test("parses a night's repeat, or none", () => {
  assert.deepEqual(parseNight({ ...valid, repeat: { freq: "monthly", week: -1 } }).repeat, { freq: "monthly", week: -1 });
  assert.throws(() => parseNight({ ...valid, repeat: { freq: "daily" } }), /repeat/);
});

test("rejects a picker who isn't attending", () => {
  assert.throws(() => parseNight({ ...valid, pickerId: "zzz" }), /pickerId/);
});

test("rejects a missing field rather than reading it as none", () => {
  const { startTime: _, ...noStartTime } = valid;
  assert.throws(() => parseNight(noStartTime), /startTime/);
});

test("rejects non-array attendees", () => {
  assert.throws(() => parseNight({ ...valid, attendees: {} }), /attendees/);
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

test("parseNight rejects a null pickerId (every Night has a picker)", () => {
  assert.throws(() => parseNight({ ...valid, pickerId: null }), /pickerId/);
});

test("parseNight reads an attached movie", () => {
  const n = parseNight({
    ...valid,
    movie: {
      tmdbId: 438631,
      title: "Dune",
      releaseYear: 2021,
      posterUrl: "https://img/x.jpg",
      posterThumbUrl: "https://img/x-thumb.jpg",
      genres: ["Drama"],
      runtimeMinutes: 98,
    },
  });
  assert.deepEqual(n.movie, {
    tmdbId: 438631,
    title: "Dune",
    releaseYear: 2021,
    posterUrl: "https://img/x.jpg",
    posterThumbUrl: "https://img/x-thumb.jpg",
    genres: ["Drama"],
    runtimeMinutes: 98,
  });
});

test("parseNight rejects a bad movie shape", () => {
  assert.throws(() => parseNight({ ...valid, movie: { tmdbId: "x", title: "Dune" } }), /tmdbId/);
});

test("parseNight reads the reminder settings and rejects missing ones", () => {
  assert.deepEqual(parseNight(valid).reminders, reminders);
  assert.throws(() => parseNight({ ...valid, reminders: undefined }), /reminders/);
});

test("parseNights parses an array of nights", () => {
  const ns = parseNights([valid, { ...valid, id: "n2" }]);
  assert.equal(ns.length, 2);
  assert.equal(ns[0].id, "n1");
  assert.equal(ns[1].id, "n2");
});

test("parseNights rejects a non-array", () => {
  assert.throws(() => parseNights({}), /array of nights/);
});

test("parseNights rejects a malformed element", () => {
  assert.throws(() => parseNights([valid, { id: 5 }]), /id/);
});

// nightPicker

const pickerNight: Night = {
  id: "n",
  scheduledFor: "2026-06-27",
  startTime: null,
  pickerId: "p",
  movie: null,
  attendees: [
    { id: "a", name: "Ada Lovelace" },
    { id: "p", name: "Priya Raman" },
  ],
  reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
  watchedAt: null,
  repeat: null,
};

test("nightPicker: found among the attendees", () => {
  assert.equal(nightPicker(pickerNight).name, "Priya Raman");
});
