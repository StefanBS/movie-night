import { test } from "node:test";
import assert from "node:assert/strict";

import { firstName, initials, signatureColor } from "./avatar";
import { colors } from "../theme/colors";

const names = ["Alex", "Tomas Vlk", "Priya Nair", "Sam", "Noor", "Kai", "Mia", "Leo", "", "  "];

test("signatureColor is deterministic for the same name", () => {
  assert.equal(signatureColor("Alex Rivera", colors.dark.sig), signatureColor("Alex Rivera", colors.dark.sig));
});

test("signatureColor always returns a colour from the given palette", () => {
  for (const theme of [colors.dark, colors.light]) {
    for (const name of names) {
      assert.ok(theme.sig.includes(signatureColor(name, theme.sig)), `signatureColor(${JSON.stringify(name)})`);
    }
  }
});

test("signatureColor gives a person the same slot in both themes", () => {
  for (const name of names) {
    const dark = colors.dark.sig.indexOf(signatureColor(name, colors.dark.sig));
    const light = colors.light.sig.indexOf(signatureColor(name, colors.light.sig));
    assert.equal(dark, light, `signatureColor(${JSON.stringify(name)})`);
  }
});

test("signatureColor matches the design system hash (sum of char codes mod 7)", () => {
  const cases: [string, number][] = [
    ["A", 65 % 7],
    ["Tomas Vlk", [..."Tomas Vlk"].reduce((h, c) => h + c.charCodeAt(0), 0) % 7],
    ["  Sam  ", (83 + 97 + 109) % 7],
    ["", 0],
  ];
  for (const [name, want] of cases) {
    assert.equal(signatureColor(name, colors.dark.sig), colors.dark.sig[want], `signatureColor(${JSON.stringify(name)})`);
  }
});

test("signatureColor distributes across more than one colour", () => {
  const used = new Set(names.map((n) => signatureColor(n, colors.dark.sig)));
  assert.ok(used.size > 1);
});

test("firstName handles the common cases", () => {
  const cases: [string, string][] = [
    ["Alex Rivera", "Alex"],
    ["Tomas", "Tomas"],
    ["  priya  patel ", "priya"],
    ["Jean-Luc Picard", "Jean-Luc"],
    ["", ""],
    ["   ", ""],
  ];
  for (const [input, want] of cases) {
    assert.equal(firstName(input), want, `firstName(${JSON.stringify(input)})`);
  }
});

test("initials handles the common cases", () => {
  const cases: [string, string][] = [
    ["Alex Rivera", "AR"],
    ["Tomas", "T"],
    ["  priya  patel ", "PP"],
    ["madonna", "M"],
    ["Jean-Luc Picard", "JP"],
    ["", "?"],
    ["   ", "?"],
  ];
  for (const [input, want] of cases) {
    assert.equal(initials(input), want, `initials(${JSON.stringify(input)})`);
  }
});
