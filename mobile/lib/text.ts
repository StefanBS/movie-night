// capitalize upper-cases the first letter, for a label that is lowercase so it
// can sit mid-sentence ("tonight", "in 3 days") but here starts a line.
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
