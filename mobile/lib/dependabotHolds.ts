// Checks that Dependabot's ignore list mirrors the Expo SDK compatibility
// matrix (bundledNativeModules.json). Dependabot can't see that matrix, so a
// package Expo governs but the ignore list forgets gets bumped off it, and
// `just check-deps` then fails on the bot's PR. This finds the gap on the PR
// that adds the dependency, before a bump ever happens.
//
// The tiers match the comments in .github/dependabot.yml:
//   - an exact pin ("9.2.1") must be held entirely (an entry with no update-types)
//   - a `~` range ("~58.0.5") must hold minor + major and let patches through
//
// Dependency names not in the matrix are skipped.

export type UpdateType = "major" | "minor" | "patch";

export type IgnoreEntry = {
  dependencyName: string;
  // undefined = every update is ignored
  updateTypes?: UpdateType[];
};

const ALL: UpdateType[] = ["major", "minor", "patch"];

// Dependabot's dependency-name supports `*` as a wildcard.
function nameMatches(pattern: string, name: string): boolean {
  const re = new RegExp(
    "^" + pattern.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\/]/g, "\\$&")).join(".*") + "$",
  );
  return re.test(name);
}

function heldTypes(name: string, ignores: IgnoreEntry[]): Set<UpdateType> {
  const held = new Set<UpdateType>();
  for (const entry of ignores) {
    if (!nameMatches(entry.dependencyName, name)) continue;
    for (const t of entry.updateTypes ?? ALL) held.add(t);
  }
  return held;
}

function describe(held: Set<UpdateType>): string {
  if (held.size === 0) return "nothing held";
  return "holds " + ALL.filter((t) => held.has(t)).join("+");
}

// Returns one message per dependency whose hold doesn't match its matrix tier.
// Empty means the ignore list and the matrix agree.
export function findHoldGaps(
  matrix: Record<string, string>,
  dependencies: string[],
  ignores: IgnoreEntry[],
): string[] {
  const gaps: string[] = [];
  for (const name of [...dependencies].sort()) {
    const pin = matrix[name];
    if (pin === undefined) continue;
    const held = heldTypes(name, ignores);
    if (pin.startsWith("~")) {
      if (!held.has("major") || !held.has("minor") || held.has("patch")) {
        gaps.push(
          `${name}: Expo pins ${pin}, so hold major+minor only (patches stay in-matrix); currently ${describe(held)}`,
        );
      }
    } else if (/^\d/.test(pin)) {
      if (held.size !== ALL.length) {
        gaps.push(`${name}: Expo pins exactly ${pin}, so hold every update; currently ${describe(held)}`);
      }
    } else {
      gaps.push(`${name}: unrecognised matrix range ${pin}; teach lib/dependabotHolds.ts about it`);
    }
  }
  return gaps;
}

// Converts the raw `ignore:` list from dependabot.yml into IgnoreEntry values.
export function parseIgnores(raw: unknown): IgnoreEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const entry = item as { "dependency-name"?: unknown; "update-types"?: unknown };
    if (typeof entry["dependency-name"] !== "string") {
      throw new Error(`dependabot ignore entry without a dependency-name: ${JSON.stringify(item)}`);
    }
    const types = entry["update-types"];
    if (types === undefined) return { dependencyName: entry["dependency-name"] };
    if (!Array.isArray(types)) throw new Error(`update-types must be a list: ${JSON.stringify(item)}`);
    return {
      dependencyName: entry["dependency-name"],
      updateTypes: types.map((t) => {
        const m = /^version-update:semver-(major|minor|patch)$/.exec(String(t));
        if (!m) throw new Error(`unknown update-type ${String(t)}`);
        return m[1] as UpdateType;
      }),
    };
  });
}
