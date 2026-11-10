import { errorMessage } from "./errors";
import { searchMovies, type SearchResult } from "./movies";
import { attachMovie, changeNightPicker, detachMovie, type Night } from "./nights";
import { createSessionCore, withSession, type Session } from "./session";

// The editor module for a saved Night: choosing or clearing its film and
// changing its picker. It keeps the stored picker — only changePicker moves it
// (ADR-0008). Writes are one at a time: while one runs (busy), the others
// return null without a request. Date and attendees are edited on the Edit
// screen (lib/nightEdit).

export type EditorStep = "pick" | "night";

export type NightEditorState = {
  night: Night;
  step: EditorStep;
  // pickFromNight is whether the Pick step was opened from the Night view, so
  // its back returns there; false while still on the step the editor opened
  // on, whose back belongs to the screen that opened it.
  pickFromNight: boolean;
  busy: string | null;
  actionError: string | null;
  results: SearchResult[];
  // resultsFor is the trimmed query the results answer ("" before any search),
  // so the screen can tell "no films match" from "still typing".
  resultsFor: string;
  searching: boolean;
  searchError: string | null;
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
    pickFromNight: initialStep !== "pick",
    busy: null,
    actionError: null,
    results: [],
    resultsFor: "",
    searching: false,
    searchError: null,
  });

  let lastWriteAt = -Infinity;
  // searchingFor is the query of the search in flight (null when idle).
  let searchingFor: { q: string } | null = null;

  // write runs one Night write under core.act, keeping the returned Night; on
  // failure the Night is unchanged and the error is shown.
  const write = (busyKey: string, run: (signal: AbortSignal) => Promise<Night>, fallback: string) =>
    core.act(busyKey, fallback, async (signal) => {
      const updated = await run(signal);
      lastWriteAt = performance.now();
      core.set({ night: updated });
      return updated;
    });

  const nightId = night.id;

  return withSession<NightEditor>(core, {
    pickFilm() {
      core.set({ step: "pick", pickFromNight: true });
    },

    toNight() {
      core.set({ step: "night" });
    },

    async search(query) {
      const q = query.trim();
      // Submitting the field and the typing debounce both ask for the same
      // query; one request answers both.
      const { resultsFor, searchError } = core.state;
      if (q !== "" && (q === searchingFor?.q || (searchingFor === null && q === resultsFor && searchError === null))) {
        return;
      }
      if (q === "") {
        searchingFor = null;
        core.set({ results: [], resultsFor: "", searching: false, searchError: null });
        // Cancels a search still in flight; a blank query sends no request.
        await core.latest("search", async () => []);
        return;
      }
      const mine = { q };
      searchingFor = mine;
      core.set({ searching: true, searchError: null });
      try {
        // null: a newer search replaced this one, or the screen closed.
        const results = await core.latest("search", (signal) => searchMovies(baseUrl, groupId, nightId, q, signal));
        if (results !== null) {
          core.set({ results, resultsFor: q, searching: false });
        }
      } catch (e) {
        core.set({ searching: false, searchError: errorMessage(e, "search failed") });
      } finally {
        if (searchingFor === mine) {
          searchingFor = null;
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
  });
}
