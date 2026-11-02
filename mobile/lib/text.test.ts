import { test } from "node:test";
import assert from "node:assert/strict";

import { capitalize } from "./text";

const cases: { in: string; want: string }[] = [
  { in: "tonight", want: "Tonight" },
  { in: "in 3 days · 8:00 pm", want: "In 3 days · 8:00 pm" },
  { in: "Already", want: "Already" },
  { in: "", want: "" },
];
for (const c of cases) {
  test(`capitalize(${JSON.stringify(c.in)}) is ${JSON.stringify(c.want)}`, () => {
    assert.equal(capitalize(c.in), c.want);
  });
}
