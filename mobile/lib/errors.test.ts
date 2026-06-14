import { test } from "node:test";
import assert from "node:assert/strict";

import { errorMessage } from "./errors";

test("errorMessage", async (t) => {
  const cases: { name: string; value: unknown; fallback: string; want: string }[] = [
    { name: "uses an Error's message", value: new Error("boom"), fallback: "fallback", want: "boom" },
    { name: "falls back on a string throw", value: "boom", fallback: "fallback", want: "fallback" },
    { name: "falls back on null", value: null, fallback: "fallback", want: "fallback" },
    { name: "falls back on a plain object", value: { message: "boom" }, fallback: "fallback", want: "fallback" },
  ];
  for (const c of cases) {
    await t.test(c.name, () => {
      assert.equal(errorMessage(c.value, c.fallback), c.want);
    });
  }
});
