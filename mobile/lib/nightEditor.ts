import { errorMessage } from "./errors";
import { searchMovies, type Movie } from "./movies";
import { attachMovie, changeNightPicker, detachMovie, listNights, type Night } from "./nights";
import { createSessionCore, type Session } from "./session";

// The editor module for a saved Night: choosing or clearing its film and
// changing its picker. It keeps the stored picker — only changePicker moves it
// (ADR-0008). Writes are one at a time: while one runs (busy), the others
// return null without a request. Date and attendees are edited on the Edit
// screen (lib/nightEdit).

export type EditorStep = "pick" | "night";

export type NightEditorState = {
  night: Night;
  step: EditorStep;
  busy: string | null;
  actionError: string | null;
  results: Movie[];
  // resultsFor is the trimmed query the results answer ("" before any search),
  // so the screen can tell "no films match" from "still typing".
  resultsFor: string;
  searching: boolean;
  searchError: string | null;
  // groupNights is every Night of the group, loaded once the Pick step opens,
  // for the "watched May 2" hints (lib/history watchedOn). It's a hint: a
  // failed load leaves it empty.
  groupNights: Night[];
};

export type NightEditor = Session<NightEditorState> & {
  pickFilm(): void;
  toNight(): void;
  // search runs as the user types: a newer query cancels an older one, and a
  // blank query clears the results without a request.
  search(query: string): Promise<void>;
  // attach sets the film and returns to the Night view.
  attach(tmdbId: number): Promise<Night | null>;
  clearFilm(): Promise<Night | null>;
  changePicker(memberId: string): Promise<Night | null>;
  // refresh swaps in a Night loaded since, keeping the step, search
  // and errors. loadStartedAt (performance.now()) is when that load began: a
  // load that began before the last write finished may have read the Night
  // before it, so it is ignored, as is any refresh while a write runs.
  refresh(night: Night, loadStartedAt: number): void;
};

export function createNightEditor({
  baseUrl,
  groupId,
  night,
  initialStep = "night",
}: {
  baseUrl: string;
  groupId: string;
  night: Night;
  initialStep?: EditorStep;
}): NightEditor {
  const core = createSessionCore<NightEditorState>({
    night,
    step: initialStep,
    busy: null,
    actionError: null,
    results: [],
    resultsFor: "",
    searching: false,
    searchError: null,
    groupNights: [],
  });

  let lastWriteAt = -Infinity;
  let searchController: AbortController | null = null;
  // searchingFor is the query searchController is answering ("" when idle).
  let searchingFor = "";
  let groupNightsRequested = false;

  // loadGroupNights fetches the group's Nights the first time the Pick step
  // opens. It never sets an error: the hints just don't show.
  const loadGroupNights = async () => {
    if (groupNightsRequested) {
      return;
    }
    groupNightsRequested = true;
    try {
      const groupNights = await core.track((signal) => listNights(baseUrl, groupId, signal));
      core.set({ groupNights });
    } catch {
      groupNightsRequested = false;
    }
  };
  if (initialStep === "pick") {
    void loadGroupNights();
  }

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
      lastWriteAt = performance.now();
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
      void loadGroupNights();
    },

    toNight() {
      core.set({ step: "night" });
    },

    async search(query) {
      const q = query.trim();
      // Submitting the field and the typing debounce both ask for the same
      // query; one request answers both.
      const { resultsFor, searchError } = core.state;
      if (q !== "" && (q === searchingFor || (searchController === null && q === resultsFor && searchError === null))) {
        return;
      }
      searchController?.abort();
      searchController = null;
      searchingFor = "";
      if (q === "") {
        core.set({ results: [], resultsFor: "", searching: false, searchError: null });
        return;
      }
      const controller = new AbortController();
      searchController = controller;
      searchingFor = q;
      core.set({ searching: true, searchError: null });
      try {
        const results = await core.track((signal) => searchMovies(baseUrl, q, signal), controller);
        if (searchController === controller) {
          core.set({ results, resultsFor: q, searching: false });
        }
      } catch (e) {
        // An aborted search was replaced by a newer one, or the screen closed.
        if (!controller.signal.aborted) {
          core.set({ searching: false, searchError: errorMessage(e, "search failed") });
        }
      } finally {
        if (searchController === controller) {
          searchController = null;
          searchingFor = "";
        }
      }
    },

    async attach(tmdbId) {
      const updated = await write(
        String(tmdbId),
        (signal) => attachMovie(baseUrl, groupId, nightId, tmdbId, signal),
        "failed to attach movie",
      );
      if (updated !== null) {
        core.set({ results: [], resultsFor: "", searchError: null, step: "night" });
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
        (signal) => changeNightPicker(baseUrl, groupId, core.state.night, memberId, signal),
        "failed to change picker",
      );
    },

    refresh(night, loadStartedAt) {
      if (core.state.busy !== null || loadStartedAt < lastWriteAt) {
        return;
      }
      core.set({ night });
    },
  };
}
