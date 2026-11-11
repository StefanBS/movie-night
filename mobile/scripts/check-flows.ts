// Fails when a Maestro flow in .maestro/ breaks a rule: every flow has an
// area tag, and none presses Enter. Pure logic and the rules' reasons:
// lib/flowChecks.ts.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { findFlowProblems } from "../lib/flowChecks";

const mobile = fileURLToPath(new URL("..", import.meta.url));
const root = join(mobile, ".maestro");

// Top-level files are the flows `just e2e` runs; common/ holds subflows.
const files = readdirSync(root, { recursive: true, encoding: "utf8" })
  .filter((p) => p.endsWith(".yaml"))
  .sort();

const problems = files.flatMap((p) =>
  findFlowProblems({
    path: relative(mobile, join(root, p)),
    text: readFileSync(join(root, p), "utf8"),
    subflow: p.includes("/"),
  }),
);

if (problems.length > 0) {
  console.error("check-flows:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`check-flows: ${files.length} flow files OK.`);
