import { errorMessage } from "./errors";
import type { Member } from "./members";
import { searchMovies, type Movie } from "./movies";
import { attachMovie, detachMovie, recordNightPick, type Night } from "./nights";
import { createSessionCore, type Session } from "./session";

// The editor module for a saved Night: choosing or clearing its film and
// changing its picker. It keeps the stored picker — only changePicker moves it
// (ADR-0008). Writes are one at a time: while one runs (busy), the others
// return null without a request. Date and attendees are edited elsewhere (the
// Edit screen).

export type EditorStep = "pick" | "night";

export type NightEditorState = {
  night: Night;
  members: Member[];
  step: EditorStep;
  busy: string | null;
  actionError: string | null;
  results: Movie[];
  searching: boolean;
  searchError: string | null;
};

export type NightEditor = Session<NightEditorState> & {
  pickFilm(): void;
  toNight(): void;
  search(query: string): Promise<void>;
  // attach sets the film and returns to the Night view.
  attach(tmdbId: number): Promise<Night | null>;
  clearFilm(): Promise<Night | null>;
  changePicker(memberId: string): Promise<Night | null>;
};

export function createNightEditor({
  baseUrl,
  groupId,
  night,
  members,
  initialStep = "night",
}: {
  baseUrl: string;
  groupId: string;
  night: Night;
  members: Member[];
  initialStep?: EditorStep;
}): NightEditor {
  const core = createSessionCore<NightEditorState>({
    night,
    members,
    step: initialStep,
    busy: null,
    actionError: null,
    results: [],
    searching: false,
    searchError: null,
  });

  // write runs one Night write under the busy guard, keeping the returned
  // Night; on failure the Night is unchanged and the error is shown.
  const write = async (
    busyKey: string,
    run: (signal: AbortSignal) => Promise<Night>,
    fallback: string,
  ): Promise<Night | null> => {
    if (core.state.busy !== null) {
      return null;
    }
    core.set({ busy: busyKey, actionError: null });
    try {
      const updated = await core.track(run);
      core.set({ night: updated, busy: null });
      return updated;
    } catch (e) {
      core.set({ busy: null, actionError: errorMessage(e, fallback) });
      return null;
    }
  };

  const nightId = night.id;

  return {
    get state() {
      return core.state;
    },
    subscribe: core.subscribe,
    dispose: core.dispose,

    pickFilm() {
      core.set({ step: "pick" });
    },

    toNight() {
      core.set({ step: "night" });
    },

    async search(query) {
      const q = query.trim();
      if (q === "" || core.state.searching) {
        return;
      }
      core.set({ searching: true, searchError: null });
      try {
        const results = await core.track((signal) => searchMovies(baseUrl, q, signal));
        core.set({ results, searching: false });
      } catch (e) {
        core.set({ searching: false, searchError: errorMessage(e, "search failed") });
      }
    },

    async attach(tmdbId) {
      const updated = await write(
        String(tmdbId),
        (signal) => attachMovie(baseUrl, groupId, nightId, tmdbId, signal),
        "failed to attach movie",
      );
      if (updated !== null) {
        core.set({ results: [], searchError: null, step: "night" });
      }
      return updated;
    },

    async clearFilm() {
      if (core.state.night.movie === null) {
        return null;
      }
      const updated = await write(
        "clear-film",
        (signal) => detachMovie(baseUrl, groupId, nightId, signal),
        "failed to clear film",
      );
      if (updated !== null) {
        core.set({ step: "night" });
      }
      return updated;
    },

    changePicker(memberId) {
      return write(
        memberId,
        (signal) => recordNightPick(baseUrl, groupId, nightId, memberId, signal),
        "failed to record pick",
      );
    },
  };
}
