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

// rankAmong is the turn order over the attendees: the club's full ranking
// (core only), filtered. The backend's ranking sorts by served count, last
// pick and rotation position, none of which depend on who is present, so the
// ranking over any subset is the full ranking with the absent left out. Pure.
export function rankAmong(ranking: readonly TurnMember[], attendeeIds: ReadonlySet<string>): TurnMember[] {
  return ranking.filter((m) => attendeeIds.has(m.id));
}

// PickingState is the part of a draft's state that createPicking owns.
export type PickingState = {
  attendeeIds: ReadonlySet<string>;
  // order is the turn ranking over attendeeIds (rankAmong).
  order: TurnMember[];
  pickerId: string | null;
};

// PickingCore is the slice of a session core (lib/session) createPicking
// drives; any session whose state includes PickingState fits.
type PickingCore = {
  readonly state: PickingState;
  set(patch: Partial<PickingState>): void;
};

// createPicking is the "who's coming, who picks" draft shared by the New night
// and We watched it flows. It ranks attendees from the full ranking it was
// reset with, so a toggle reranks on the spot, without a request; an
// explicitly chosen picker holds until they stop attending (draftPicker).
export function createPicking(core: PickingCore) {
  let chosen: string | null = null;
  let ranking: readonly TurnMember[] = [];

  const set = (attendeeIds: ReadonlySet<string>) => {
    if (chosen !== null && !attendeeIds.has(chosen)) {
      chosen = null; // they left, so the pick goes back to the order
    }
    const order = rankAmong(ranking, attendeeIds);
    core.set({ attendeeIds, order, pickerId: draftPicker(order, attendeeIds, chosen) });
  };

  return {
    // reset starts the draft over from loaded attendees, the club's full
    // ranking and an already-chosen picker (null: follow the order).
    reset(attendeeIds: ReadonlySet<string>, fullRanking: readonly TurnMember[], picker: string | null) {
      chosen = picker;
      ranking = fullRanking;
      set(attendeeIds);
    },

    toggle(memberId: string) {
      const next = new Set(core.state.attendeeIds);
      if (!next.delete(memberId)) {
        next.add(memberId);
      }
      set(next);
    },

    choosePicker(memberId: string) {
      chosen = memberId;
      set(core.state.attendeeIds);
    },
  };
}
