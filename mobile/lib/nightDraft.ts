import { errorMessage } from "./errors";
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

// PickingState is the part of a draft's state that createPicking owns.
export type PickingState = {
  attendeeIds: ReadonlySet<string>;
  // order is the live turn ranking over attendeeIds.
  order: TurnMember[];
  pickerId: string | null;
  actionError: string | null;
};

// PickingCore is the slice of a session core (lib/session) createPicking
// drives; any session whose state includes PickingState fits.
type PickingCore = {
  readonly state: PickingState;
  set(patch: Partial<PickingState>): void;
  track<T>(run: (signal: AbortSignal) => Promise<T>, controller?: AbortController): Promise<T>;
};

// createPicking is the "who's coming, who picks" draft shared by the New night
// and We watched it flows: toggling attendees reranks them with `rank` (a rank
// that returns after a newer one is dropped), and an explicitly chosen picker
// holds until they stop attending (draftPicker).
export function createPicking(
  core: PickingCore,
  rank: (present: string[], signal: AbortSignal) => Promise<TurnMember[]>,
) {
  let chosen: string | null = null;
  let latest: AbortController | null = null;
  let ranked: Promise<void> = Promise.resolve();

  const set = (patch: Partial<Pick<PickingState, "attendeeIds" | "order">>) => {
    const attendeeIds = patch.attendeeIds ?? core.state.attendeeIds;
    const order = patch.order ?? core.state.order;
    if (chosen !== null && !attendeeIds.has(chosen)) {
      chosen = null; // they left, so the pick goes back to the order
    }
    core.set({ ...patch, pickerId: draftPicker(order, attendeeIds, chosen) });
  };

  return {
    // reset starts the draft over from loaded attendees, their order and an
    // already-chosen picker (null: follow the order).
    reset(attendeeIds: ReadonlySet<string>, order: TurnMember[], picker: string | null) {
      chosen = picker;
      set({ attendeeIds, order });
    },

    toggle(memberId: string): Promise<void> {
      const next = new Set(core.state.attendeeIds);
      if (!next.delete(memberId)) {
        next.add(memberId);
      }
      set({ attendeeIds: next });

      latest?.abort();
      const controller = new AbortController();
      latest = controller;
      ranked = (async () => {
        try {
          const order = await core.track((signal) => rank([...next], signal), controller);
          if (latest === controller) {
            core.set({ actionError: null });
            set({ order });
          }
        } catch (e) {
          if (!controller.signal.aborted) {
            core.set({ actionError: errorMessage(e, "failed to load pick order") });
          }
        }
      })();
      return ranked;
    },

    choosePicker(memberId: string) {
      chosen = memberId;
      set({});
    },

    // settled resolves when the latest rerank does, so a save uses the picker
    // of the order it asked for, not the one on hand when it was tapped.
    settled(): Promise<void> {
      return ranked;
    },
  };
}
