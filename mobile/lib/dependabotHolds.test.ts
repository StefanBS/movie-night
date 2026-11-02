import { test } from "node:test";
import assert from "node:assert/strict";

import { findHoldGaps, parseIgnores, type IgnoreEntry } from "./dependabotHolds";

const minorMajor: IgnoreEntry["updateTypes"] = ["major", "minor"];

test("findHoldGaps", async (t) => {
  const cases: {
    name: string;
    matrix: Record<string, string>;
    deps: string[];
    ignores: IgnoreEntry[];
    gaps: string[];
  }[] = [
    {
      name: "exact pin fully held",
      matrix: { react: "19.3.0" },
      deps: ["react"],
      ignores: [{ dependencyName: "react" }],
      gaps: [],
    },
    {
      name: "exact pin not held (the #165 case)",
      matrix: { "@react-native-community/datetimepicker": "9.2.1" },
      deps: ["@react-native-community/datetimepicker"],
      ignores: [],
      gaps: [
        "@react-native-community/datetimepicker: Expo pins exactly 9.2.1, so hold every update; currently nothing held",
      ],
    },
    {
      name: "exact pin only partly held",
      matrix: { "react-native-svg": "15.16.0" },
      deps: ["react-native-svg"],
      ignores: [{ dependencyName: "react-native-svg", updateTypes: minorMajor }],
      gaps: ["react-native-svg: Expo pins exactly 15.16.0, so hold every update; currently holds major+minor"],
    },
    {
      name: "tilde range held major+minor via wildcard",
      matrix: { "expo-router": "~58.0.29" },
      deps: ["expo-router"],
      ignores: [{ dependencyName: "expo-*", updateTypes: minorMajor }],
      gaps: [],
    },
    {
      name: "tilde range held by entries that add up",
      matrix: { expo: "~58.0.22" },
      deps: ["expo"],
      ignores: [
        { dependencyName: "expo", updateTypes: ["major"] },
        { dependencyName: "expo", updateTypes: ["minor"] },
      ],
      gaps: [],
    },
    {
      name: "tilde range over-held blocks the patches check-deps demands",
      matrix: { "react-native-screens": "~4.30.1" },
      deps: ["react-native-screens"],
      ignores: [{ dependencyName: "react-native-screens" }],
      gaps: [
        "react-native-screens: Expo pins ~4.30.1, so hold major+minor only (patches stay in-matrix); currently holds major+minor+patch",
      ],
    },
    {
      name: "tilde range not held",
      matrix: { "expo-blur": "~58.0.5" },
      deps: ["expo-blur"],
      ignores: [],
      gaps: ["expo-blur: Expo pins ~58.0.5, so hold major+minor only (patches stay in-matrix); currently nothing held"],
    },
    {
      name: "wildcard does not over-match a sibling name",
      matrix: { "react-native": "0.88.1" },
      deps: ["react-native"],
      ignores: [{ dependencyName: "react-native-*" }],
      gaps: ["react-native: Expo pins exactly 0.88.1, so hold every update; currently nothing held"],
    },
    {
      name: "deps outside the matrix are ignored",
      matrix: { react: "19.3.0" },
      deps: ["lucide-react-native", "react-native-svg-transformer"],
      ignores: [],
      gaps: [],
    },
    {
      name: "matrix entries the app doesn't depend on are ignored",
      matrix: { "expo-camera": "~58.0.1" },
      deps: [],
      ignores: [],
      gaps: [],
    },
    {
      name: "unrecognised range is reported, not silently passed",
      matrix: { odd: ">=1.0.0" },
      deps: ["odd"],
      ignores: [],
      gaps: ["odd: unrecognised matrix range >=1.0.0; teach lib/dependabotHolds.ts about it"],
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      assert.deepEqual(findHoldGaps(c.matrix, c.deps, c.ignores), c.gaps);
    });
  }
});

test("parseIgnores", async (t) => {
  await t.test("maps dependabot.yml entries", () => {
    assert.deepEqual(
      parseIgnores([
        { "dependency-name": "react" },
        { "dependency-name": "expo-*", "update-types": ["version-update:semver-major", "version-update:semver-minor"] },
      ]),
      [{ dependencyName: "react" }, { dependencyName: "expo-*", updateTypes: ["major", "minor"] }],
    );
  });
  await t.test("missing list is empty", () => {
    assert.deepEqual(parseIgnores(undefined), []);
  });
  await t.test("unknown update-type throws", () => {
    assert.throws(() => parseIgnores([{ "dependency-name": "x", "update-types": ["semver-major"] }]));
  });
});
