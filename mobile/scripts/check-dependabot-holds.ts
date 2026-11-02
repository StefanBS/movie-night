// Fails when .github/dependabot.yml's /mobile ignore list doesn't mirror the
// Expo SDK matrix. Pure logic and tiers: lib/dependabotHolds.ts.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

import { findHoldGaps, parseIgnores } from "../lib/dependabotHolds";

const require = createRequire(import.meta.url);
const configPath = fileURLToPath(new URL("../../.github/dependabot.yml", import.meta.url));

const matrix: Record<string, string> = require("expo/bundledNativeModules.json");
const pkg = require("../package.json") as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const config = parse(readFileSync(configPath, "utf8")) as {
  updates: { "package-ecosystem": string; directory?: string; ignore?: unknown }[];
};

const mobile = config.updates.find((u) => u["package-ecosystem"] === "npm" && u.directory === "/mobile");
if (!mobile) throw new Error("no npm /mobile entry in .github/dependabot.yml");

const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const gaps = findHoldGaps(matrix, deps, parseIgnores(mobile.ignore));

if (gaps.length > 0) {
  console.error("Dependabot's ignore list in .github/dependabot.yml is out of step with the Expo SDK matrix:");
  for (const gap of gaps) console.error(`  - ${gap}`);
  console.error("Add or adjust the hold under the matching tier (see the comments there).");
  process.exit(1);
}
console.log(`Dependabot holds match the Expo matrix (${deps.filter((d) => d in matrix).length} governed deps).`);
