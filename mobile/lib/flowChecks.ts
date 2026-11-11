// Rules for the Maestro flows in .maestro/, checked by scripts/check-flows.ts
// (`just check-flows`) on each file's parsed YAML.
import { parseAllDocuments } from "yaml";

// The areas a flow touches. `just e2e "<marker>" --tags <list>` runs the
// flows tagged with any of them (maestro test --include-tags). A flow takes
// the tag of every area whose screen it acts in or asserts on, so that
// changing a screen and running its tag runs every flow that would notice.
// Starting on Tonight doesn't count (every flow does), and neither do shared
// components (TopBar, tabs), which call for the full battery.
//   nights:   Tonight's night, night/*, Watched, rotation
//   members:  Club, member/*
//   identity: welcome ("Who are you?")
//   settings: settings
export const AREA_TAGS = ["nights", "members", "identity", "settings"] as const;
// smoke: a few flows that between them touch the most screens. Not an area,
// so a flow tagged only smoke still needs an area tag.
export const OTHER_TAGS = ["smoke"] as const;

const known = new Set<string>([...AREA_TAGS, ...OTHER_TAGS]);
const areas = new Set<string>(AREA_TAGS);

export type FlowFile = {
  path: string;
  text: string;
  // A subflow (.maestro/common/) only runs through runFlow, never on its own,
  // so it needs no tags.
  subflow: boolean;
};

export function findFlowProblems(file: FlowFile): string[] {
  const docs = parseAllDocuments(file.text);
  if (!Array.isArray(docs)) return [`${file.path}: no YAML documents`];
  const yamlErrors = docs.flatMap((d) => d.errors.map((e) => `${file.path}: ${e.message}`));
  if (yamlErrors.length > 0) return yamlErrors;

  const problems: string[] = [];
  // A flow is a header document (appId, name, tags, env) and, after `---`,
  // its commands; a file without `---` is commands only.
  const values = docs.map((d) => d.toJS() as unknown);
  const header = values.length > 1 ? values[0] : undefined;

  if (!file.subflow) problems.push(...tagProblems(file.path, header));

  // pressKey Enter is a raw key event that makes Gboard apply its
  // autocorrection ("Snowpiercer" became "Snow piercer"), which a person
  // tapping the keyboard's ✓ never triggers (#285). Close the keyboard with
  // hideKeyboard instead.
  if (values.slice(header === undefined ? 0 : 1).some(pressesEnter)) {
    problems.push(`${file.path}: use hideKeyboard, not pressKey: Enter (#285)`);
  }
  return problems;
}

function tagProblems(path: string, header: unknown): string[] {
  const tags = isRecord(header) ? header.tags : undefined;
  const want = `tag it with one of: ${AREA_TAGS.join(", ")}`;
  if (tags === undefined) return [`${path}: no tags; ${want}`];
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
    return [`${path}: tags must be a list of names`];
  }
  const problems = tags
    .filter((t) => !known.has(t))
    .map((t) => `${path}: unknown tag "${t}" (known: ${[...known].join(", ")})`);
  if (!tags.some((t) => areas.has(t))) problems.push(`${path}: no area tag; ${want}`);
  return problems;
}

// Any command, at any depth (runFlow, repeat and retry nest commands).
function pressesEnter(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(pressesEnter);
  if (!isRecord(value)) return false;
  if (typeof value.pressKey === "string" && value.pressKey.toLowerCase() === "enter") return true;
  return Object.values(value).some(pressesEnter);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
