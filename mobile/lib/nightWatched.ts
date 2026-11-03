import { errorMessage } from "./errors";
import { fetchMembers, type Member } from "./members";
import { draftPicker } from "./nightDraft";
import { getNightOrNull, getNightTurn, recordWatched, type Night } from "./nights";
import { createSessionCore, type Session } from "./session";
import type { TurnMember } from "./turn";

// The module behind the "We watched it" flow for a planned Night (ADR-0012):
// People, pre-filled with who was coming, then Done. record() saves who came,
// who picked and that they watched it in one request, so Done is a receipt of
// what was saved; backing out of Done to People keeps the record.

export type WatchedStep = "who" | "done";

export type NightWatchedState = {
  loading: boolean;
  error: string | null;
  // night is the Night as last loaded or recorded; null after a load only when
  // the backend has no such Night.
  night: Night | null;
  members: Member[];
  step: WatchedStep;
  attendeeIds: ReadonlySet<string>;
  // order is the live turn ranking over attendeeIds, ignoring the Night's own
  // pick, so it is the order the picker was chosen from.
  order: TurnMember[];
  pickerId: string | null;
  busy: "record" | null;
  actionError: string | null;
};

export type NightWatched = Session<NightWatchedState> & {
  // load fetches the Night, the roster and its pick order, and opens People.
  load(): Promise<void>;
  // toggle adds or removes an attendee, then reranks. A rank that returns
  // after a newer one is dropped.
  toggle(memberId: string): Promise<void>;
  // choosePicker overrides the order until that person stops attending.
  choosePicker(memberId: string): void;
  // record saves the Night as watched and moves on to Done, or returns null
  // (no picker, already saving, or the backend refused — see actionError)
  // and stays on People with the selection intact.
  record(): Promise<Night | null>;
  // back returns from Done to People.
  back(): void;
};

export function createNightWatched({
  baseUrl,
  groupId,
  nightId,
}: {
  baseUrl: string;
  groupId: string;
  nightId: string;
}): NightWatched {
  const core = createSessionCore<NightWatchedState>({
    loading: true,
    error: null,
    night: null,
    members: [],
    step: "who",
    attendeeIds: new Set(),
    order: [],
    pickerId: null,
    busy: null,
    actionError: null,
  });
  // chosen is the picker the user (or the plan) settled on: the planned
  // picker to start with, so the pick stays theirs while they're here.
  let chosen: string | null = null;
  let rank: AbortController | null = null;
  // ranked settles when the latest rerank does, so record() saves the picker
  // of the order it asked for, not the one on hand when it was tapped.
  let ranked: Promise<void> = Promise.resolve();

  const setPicking = (patch: Partial<Pick<NightWatchedState, "attendeeIds" | "order">>) => {
    const attendeeIds = patch.attendeeIds ?? core.state.attendeeIds;
    const order = patch.order ?? core.state.order;
    if (chosen !== null && !attendeeIds.has(chosen)) {
      chosen = null; // they left, so the pick goes back to the order
    }
    core.set({ ...patch, pickerId: draftPicker(order, attendeeIds, chosen) });
  };

  return {
    get state() {
      return core.state;
    },
    subscribe: core.subscribe,
    dispose: core.dispose,

    async load() {
      core.set({ loading: true, error: null });
      try {
        const [night, members, order] = await core.track(async (signal) => {
          const [night, members] = await Promise.all([
            getNightOrNull(baseUrl, groupId, nightId, signal),
            fetchMembers(baseUrl, groupId, signal),
          ]);
          // A missing Night has no order (its turn is a 404 too).
          const order = night === null ? [] : await getNightTurn(baseUrl, groupId, nightId, signal);
          return [night, members, order] as const;
        });
        chosen = night?.pickerId ?? null;
        core.set({ night, members, loading: false });
        setPicking({ attendeeIds: new Set(night?.attendees.map((a) => a.id)), order });
      } catch (e) {
        core.set({ error: errorMessage(e, "failed to load the night"), loading: false });
      }
    },

    toggle(memberId) {
      const next = new Set(core.state.attendeeIds);
      if (!next.delete(memberId)) {
        next.add(memberId);
      }
      setPicking({ attendeeIds: next });

      rank?.abort();
      const controller = new AbortController();
      rank = controller;
      ranked = (async () => {
        try {
          const order = await core.track(
            (signal) => getNightTurn(baseUrl, groupId, nightId, signal, [...next]),
            controller,
          );
          if (rank === controller) {
            core.set({ actionError: null });
            setPicking({ order });
          }
        } catch (e) {
          if (!controller.signal.aborted) {
            core.set({ actionError: errorMessage(e, "failed to load pick order") });
          }
        }
      })();
      return ranked;
    },

    choosePicker(memberId) {
      chosen = memberId;
      setPicking({});
    },

    async record() {
      if (core.state.busy !== null) {
        return null;
      }
      core.set({ busy: "record" });
      await ranked;
      const { pickerId, attendeeIds, night } = core.state;
      if (pickerId === null || night === null) {
        core.set({ busy: null });
        return null;
      }
      core.set({ actionError: null });
      try {
        const recorded = await core.track((signal) =>
          recordWatched(baseUrl, groupId, night, { attendees: [...attendeeIds], pickerId }, signal),
        );
        core.set({ night: recorded, busy: null, step: "done" });
        return recorded;
      } catch (e) {
        core.set({ busy: null, actionError: errorMessage(e, "failed to record the night") });
        return null;
      }
    },

    back() {
      core.set({ step: "who" });
    },
  };
}
