import { test } from "node:test";
import assert from "node:assert/strict";

import { MAX_INCOMING_PATH_LENGTH, safeIncomingPath } from "./deepLink";

test("safeIncomingPath", async (t) => {
  const uuid = "11111111-1111-1111-1111-111111111111";
  const cases: { name: string; path: string; initial: boolean; want: string | null }[] = [
    { name: "passes a plain route through", path: "/rotation", initial: false, want: "/rotation" },
    { name: "passes a full scheme URL through", path: `movienight://night/${uuid}`, initial: true, want: `movienight://night/${uuid}` },
    { name: "passes a query string through", path: `/night/new?date=2026-06-19&ref=${uuid}`, initial: false, want: `/night/new?date=2026-06-19&ref=${uuid}` },
    { name: "passes well-formed percent-encoding through", path: "/member/new?name=Ana%20Mar%C3%ADa", initial: false, want: "/member/new?name=Ana%20Mar%C3%ADa" },
    { name: "passes a path at the length cap through", path: "/" + "a".repeat(MAX_INCOMING_PATH_LENGTH - 1), initial: false, want: "/" + "a".repeat(MAX_INCOMING_PATH_LENGTH - 1) },
    { name: "sends an oversized initial link home", path: "/" + "a".repeat(MAX_INCOMING_PATH_LENGTH), initial: true, want: "/" },
    { name: "ignores an oversized link while running", path: "/" + "a".repeat(MAX_INCOMING_PATH_LENGTH), initial: false, want: null },
    { name: "sends a malformed-encoding initial link home", path: "/night/x?a=" + "%FF".repeat(80), initial: true, want: "/" },
    { name: "ignores a malformed-encoding link while running", path: "/night/x?a=%E0%A4%A", initial: false, want: null },
    { name: "rejects a lone percent sign", path: "/rotation?q=100%", initial: true, want: "/" },
  ];
  for (const c of cases) {
    await t.test(c.name, () => {
      assert.equal(safeIncomingPath(c.path, c.initial), c.want);
    });
  }
});
