import { errorMessage } from "./errors";

// Session is the shape shared by the framework-free screen modules (nightPlan,
// nightEditor, nightEdit, nightLoad): readable state, change notification, and
// teardown. React binds to it with useSyncExternalStore (components/useSession),
// so the modules stay free of React and are tested directly over a real HTTP
// server.
export type Session<S> = {
  readonly state: S;
  subscribe(listener: () => void): () => void;
  dispose(): void;
};

// BusyKey is what act() stores in a state's busy field while a write runs: the
// non-idle values of busy (a string key, or true for a boolean flag).
type BusyKey<S> = S extends { busy: infer B } ? Exclude<B, null | false> : never;

// createSessionCore is the plumbing behind a Session: immutable state updates
// (a new object per change, as useSyncExternalStore needs), listeners, and the
// AbortControllers of in-flight requests so dispose() can cancel them. dispose
// only aborts — the session stays usable, so a remount after React's dev-mode
// double effect still works.
export function createSessionCore<S>(initial: S) {
  let state = initial;
  const listeners = new Set<() => void>();
  const inFlight = new Set<AbortController>();
  const latestRuns = new Map<string, AbortController>();
  // idleBusy is the busy value act() returns to: the initial one (null or false).
  const idleBusy = (initial as { busy?: unknown }).busy;

  const set = (patch: Partial<S>): void => {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  };
  // setLoose sets the act() fields, which S has but its type can't promise here.
  const setLoose = (patch: Record<string, unknown>) => set(patch as Partial<S>);

  const trackWith = async <T>(controller: AbortController, run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    inFlight.add(controller);
    try {
      return await run(controller.signal);
    } finally {
      inFlight.delete(controller);
    }
  };

  return {
    get state(): S {
      return state;
    },
    set,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // track runs a request with an AbortController that dispose() can cancel.
    track<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
      return trackWith(new AbortController(), run);
    },
    // act runs one user write at a time, for a state with busy and actionError
    // fields: while a write runs (busy holds its key), it returns null without
    // a request. Otherwise it sets busy, runs the write, and returns its result
    // — or, on failure, shows the error (or fallback) in actionError and
    // returns null. busy goes back to its initial value either way, after any
    // state run set.
    async act<T>(busyKey: BusyKey<S>, fallback: string, run: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
      if ((state as { busy?: unknown }).busy !== idleBusy) {
        return null;
      }
      setLoose({ busy: busyKey, actionError: null });
      try {
        const result = await trackWith(new AbortController(), run);
        setLoose({ busy: idleBusy });
        return result;
      } catch (e) {
        setLoose({ busy: idleBusy, actionError: errorMessage(e, fallback) });
        return null;
      }
    },
    // latest runs a request where only the newest under key matters (a search
    // as the user types, a reload on focus): it aborts the previous run under
    // key, and resolves null instead of a result or an error once this run is
    // superseded or disposed. So run must not resolve null itself.
    async latest<T>(key: string, run: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
      latestRuns.get(key)?.abort();
      const controller = new AbortController();
      latestRuns.set(key, controller);
      const current = () => latestRuns.get(key) === controller && !controller.signal.aborted;
      try {
        const result = await trackWith(controller, run);
        return current() ? result : null;
      } catch (e) {
        if (current()) {
          throw e;
        }
        return null;
      } finally {
        if (latestRuns.get(key) === controller) {
          latestRuns.delete(key);
        }
      }
    },
    dispose(): void {
      for (const c of inFlight) c.abort();
      inFlight.clear();
    },
  };
}

// withSession builds a module's public Session from its core plus its own
// methods, exposing only the core's state, subscribe and dispose.
export function withSession<T extends Session<unknown>>(
  core: Session<T["state"]>,
  methods: Omit<T, keyof Session<unknown>>,
): T {
  return Object.assign(
    {
      get state() {
        return core.state;
      },
      subscribe: core.subscribe,
      dispose: core.dispose,
    },
    methods,
  ) as T;
}
