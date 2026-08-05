import { avatarTints } from "../theme/colors";

// avatarTint maps a name to one of the seven logo-ring jewel tints, deterministically,
// so a person is always the same color across the app. Sum of char codes keeps it
// pure and stable (no Math.random / no persisted state).
export function avatarTint(name: string): string {
  const key = name.trim();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash + key.charCodeAt(i)) % avatarTints.length;
  }
  return avatarTints[hash];
}

// firstName returns the leading word of a name — the app's informal address in
// "Alex picks" / "Skip Alex's turn" labels. Like initials it tolerates an empty
// or whitespace-only name, returning "" so a caller renders a bare label rather
// than a stray possessive.
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

// initials returns a 1–2 letter uppercase monogram: the first letter of the first
// two whitespace-separated words. Empty / whitespace-only names render "?".
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  const letters = words.slice(0, 2).map((w) => w[0]);
  return letters.join("").toUpperCase();
}
