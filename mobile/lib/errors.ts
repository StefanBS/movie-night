// errorMessage normalizes an unknown thrown value into a display string: the
// Error's message when it is one, otherwise the given fallback. It collapses
// the `e instanceof Error ? e.message : "…"` dance the screens would otherwise
// repeat at every catch site.
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
