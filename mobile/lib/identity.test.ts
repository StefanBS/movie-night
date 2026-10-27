import { test } from "node:test";
import assert from "node:assert/strict";

import { parseClaim, parseIdentity } from "./identity";

test("parseIdentity accepts a valid identity", () => {
  assert.deepEqual(parseIdentity({ id: "u1", name: "Ada", remindersMuted: false }), { id: "u1", name: "Ada", remindersMuted: false });
});

for (const [name, raw, message] of [
  ["a non-object", "Ada", /expected an object/],
  ["null", null, /expected an object/],
  ["a missing id", { name: "Ada" }, /id must be a string/],
  ["a non-string name", { id: "u1", name: 7 }, /name must be a string/],
  ["a missing remindersMuted", { id: "u1", name: "Ada" }, /remindersMuted must be a boolean/],
] as const) {
  test(`parseIdentity rejects ${name}`, () => {
    assert.throws(() => parseIdentity(raw), message);
  });
}

test("parseClaim accepts a token with its identity", () => {
  assert.deepEqual(parseClaim({ token: "t", identity: { id: "u1", name: "Ada", remindersMuted: false } }), {
    token: "t",
    identity: { id: "u1", name: "Ada", remindersMuted: false },
  });
});

for (const [name, raw, message] of [
  ["a non-object", [], /token must be a non-empty string/],
  ["an empty token", { token: "", identity: { id: "u1", name: "Ada", remindersMuted: false } }, /token must be a non-empty string/],
  ["a missing identity", { token: "t" }, /identity: expected an object/],
] as const) {
  test(`parseClaim rejects ${name}`, () => {
    assert.throws(() => parseClaim(raw), message);
  });
}
