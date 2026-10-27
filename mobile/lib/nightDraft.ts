import type { TurnMember } from "./turn";

// draftPicker is who picks for a plan that is not yet a Night (ADR-0008): the
// attendee the user explicitly chose, while they are still attending;
// otherwise the head of the live turn ranking over the attendees. Null when
// nobody qualifies — e.g. a guest-only plan, where the ranking (core only) is
// empty and the user must choose. Pure.
export function draftPicker(
  order: TurnMember[],
  attendeeIds: ReadonlySet<string>,
  chosen: string | null,
): string | null {
  if (chosen !== null && attendeeIds.has(chosen)) {
    return chosen;
  }
  return order[0]?.id ?? null;
}
