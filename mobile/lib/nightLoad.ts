import { errorMessage } from "./errors";
import { fetchMembers, type Member } from "./members";
import { nightDates } from "./nightLifecycle";
import { getNightOrNull, listNights, type Night } from "./nights";
import { createSessionCore, type Session } from "./session";

// The loading module behind the routes for a saved Night (the Night view and
// the Edit screen): the Night, the roster, and — for Edit's calendar — the
// dates that already hold a Night. The route calls load() on every focus. Only
// the first load shows a spinner; a refresh keeps the last good data on screen,
// so the editor below it stays mounted with its step, results and errors, and a
// failed refresh leaves that data in place.

export type NightLoadState = {
  // loaded is true once a load has succeeded; night is null after that only
  // when the backend has no such Night.
  loaded: boolean;
  night: Night | null;
  members: Member[];
  nightDates: Set<string>;
  error: string | null;
  // loadStartedAt is when the load behind this data began (performance.now()),
  // so the editor can tell a refresh from a read older than its last write.
  loadStartedAt: number;
};

export type NightLoad = Session<NightLoadState> & {
  // load fetches everything again. A newer load cancels an older one.
  load(): Promise<void>;
};

export type NightLoadView = "loading" | "failed" | "missing" | "ready";

// nightLoadView is what the route shows. A Night on screen always wins, so a
// failed refresh never replaces it with an error. Pure.
export function nightLoadView({ loaded, night, error }: NightLoadState): NightLoadView {
  if (night !== null) return "ready";
  if (error !== null) return "failed";
  return loaded ? "missing" : "loading";
}

export function createNightLoad({
  baseUrl,
  groupId,
  nightId,
  withNightDates = false,
}: {
  baseUrl: string;
  groupId: string;
  nightId: string;
  withNightDates?: boolean;
}): NightLoad {
  const core = createSessionCore<NightLoadState>({
    loaded: false,
    night: null,
    members: [],
    nightDates: new Set(),
    error: null,
    loadStartedAt: 0,
  });
  let current: AbortController | null = null;

  return {
    get state() {
      return core.state;
    },
    subscribe: core.subscribe,
    dispose: core.dispose,

    async load() {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      const loadStartedAt = performance.now();
      try {
        const [night, members, planned] = await core.track(
          (signal) =>
            Promise.all([
              getNightOrNull(baseUrl, groupId, nightId, signal),
              fetchMembers(baseUrl, groupId, signal),
              // The dots are a hint (see listNights): a failure never fails the screen.
              withNightDates ? listNights(baseUrl, groupId, signal).catch(() => [] as Night[]) : null,
            ]),
          controller,
        );
        if (current !== controller) {
          return;
        }
        core.set({
          loaded: true,
          night,
          members,
          ...(planned !== null && { nightDates: nightDates(planned) }),
          error: null,
          loadStartedAt,
        });
      } catch (e) {
        if (!controller.signal.aborted) {
          core.set({ error: errorMessage(e, "failed to load night") });
        }
      }
    },
  };
}
