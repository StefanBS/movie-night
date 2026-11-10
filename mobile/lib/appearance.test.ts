import { test } from "node:test";
import assert from "node:assert/strict";

import { colorSchemeOverride, parseThemePreference, type ThemePreference } from "./appearance";

const parseCases: { in: string | null; want: ThemePreference }[] = [
  { in: null, want: "system" },
  { in: "system", want: "system" },
  { in: "light", want: "light" },
  { in: "dark", want: "dark" },
  { in: "", want: "system" },
  { in: "Dark", want: "system" },
  { in: "sepia", want: "system" },
];
for (const c of parseCases) {
  test(`parseThemePreference(${JSON.stringify(c.in)}) is ${c.want}`, () => {
    assert.equal(parseThemePreference(c.in), c.want);
  });
}

const overrideCases: { in: ThemePreference; want: string }[] = [
  { in: "system", want: "unspecified" },
  { in: "light", want: "light" },
  { in: "dark", want: "dark" },
];
for (const c of overrideCases) {
  test(`colorSchemeOverride(${c.in}) is ${c.want}`, () => {
    assert.equal(colorSchemeOverride(c.in), c.want);
  });
}
