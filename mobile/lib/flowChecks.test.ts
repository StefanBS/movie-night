import { test } from "node:test";
import assert from "node:assert/strict";

import { findFlowProblems } from "./flowChecks";

const header = (tags: string) => `appId: \${APP_ID}\nname: A flow\n${tags}---\n`;

test("findFlowProblems", async (t) => {
  const cases: { name: string; text: string; subflow?: boolean; problems: string[] }[] = [
    {
      name: "area tag",
      text: header("tags:\n  - nights\n") + "- tapOn: Plan\n",
      problems: [],
    },
    {
      name: "area and smoke tags",
      text: header("tags: [nights, smoke]\n") + "- tapOn: Plan\n",
      problems: [],
    },
    {
      name: "no tags",
      text: header("") + "- tapOn: Plan\n",
      problems: ["f.yaml: no tags; tag it with one of: nights, members, identity, settings"],
    },
    {
      name: "empty tags",
      text: header("tags: []\n") + "- tapOn: Plan\n",
      problems: ["f.yaml: no area tag; tag it with one of: nights, members, identity, settings"],
    },
    {
      name: "smoke only",
      text: header("tags: [smoke]\n") + "- tapOn: Plan\n",
      problems: ["f.yaml: no area tag; tag it with one of: nights, members, identity, settings"],
    },
    {
      name: "a typo is unknown and leaves no area",
      text: header("tags: [night]\n") + "- tapOn: Plan\n",
      problems: [
        'f.yaml: unknown tag "night" (known: nights, members, identity, settings, smoke)',
        "f.yaml: no area tag; tag it with one of: nights, members, identity, settings",
      ],
    },
    {
      name: "tags not a list",
      text: header("tags: nights\n") + "- tapOn: Plan\n",
      problems: ["f.yaml: tags must be a list of names"],
    },
    {
      name: "no header document",
      text: "- tapOn: Plan\n",
      problems: ["f.yaml: no tags; tag it with one of: nights, members, identity, settings"],
    },
    {
      name: "pressKey Enter",
      text: header("tags: [members]\n") + '- inputText: "Snowpiercer"\n- pressKey: Enter\n',
      problems: ["f.yaml: use hideKeyboard, not pressKey: Enter (#285)"],
    },
    {
      name: "pressKey Enter nested in runFlow",
      text: header("tags: [members]\n") + "- runFlow:\n    commands:\n      - pressKey: enter\n",
      problems: ["f.yaml: use hideKeyboard, not pressKey: Enter (#285)"],
    },
    {
      name: "other keys are fine",
      text: header("tags: [members]\n") + "- pressKey: Back\n- hideKeyboard\n",
      problems: [],
    },
    {
      name: "a comment mentioning pressKey Enter is fine",
      text: header("tags: [members]\n") + "# not pressKey: Enter, see #285\n- hideKeyboard\n",
      problems: [],
    },
    {
      name: "subflow needs no tags",
      text: "appId: ${APP_ID}\n---\n- stopApp\n",
      subflow: true,
      problems: [],
    },
    {
      name: "subflow pressKey Enter",
      text: "appId: ${APP_ID}\n---\n- pressKey: Enter\n",
      subflow: true,
      problems: ["f.yaml: use hideKeyboard, not pressKey: Enter (#285)"],
    },
    {
      name: "invalid YAML",
      text: "appId: [\n",
      problems: ["f.yaml: Unexpected end of flow sequence"],
    },
  ];
  for (const c of cases) {
    await t.test(c.name, () => {
      const got = findFlowProblems({ path: "f.yaml", text: c.text, subflow: c.subflow ?? false });
      if (c.name === "invalid YAML") {
        assert.equal(got.length > 0 && got.every((p) => p.startsWith("f.yaml: ")), true, got.join("\n"));
        return;
      }
      assert.deepEqual(got, c.problems);
    });
  }
});
