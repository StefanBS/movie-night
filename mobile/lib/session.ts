// Session is the shape shared by the framework-free screen modules (nightPlan,
// nightEditor): readable state, change notification, and teardown. React binds
// to it with useSyncExternalStore (components/useSession), so the modules stay
// free of React and are tested directly over a real HTTP server.
export type Session<S> = {
  readonly state: S;
  subscribe(listener: () => void): () => void;
  dispose(): void;
};

// createSessionCore is the plumbing behind a Session: immutable state updates
// (a new object per change, as useSyncExternalStore needs), listeners, and the
// AbortControllers of in-flight requests so dispose() can cancel them. dispose
// only aborts — the session stays usable, so a remount after React's dev-mode
// double effect still works.
export function createSessionCore<S>(initial: S) {
  let state = initial;
  const listeners = new Set<() => void>();
  const inFlight = new Set<AbortController>();

  return {
    get state(): S {
      return state;
    },
    set(patch: Partial<S>): void {
      state = { ...state, ...patch };
      for (const l of listeners) l();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // track runs a request with an AbortController that dispose() can cancel.
    async track<T>(run: (signal: AbortSignal) => Promise<T>, controller = new AbortController()): Promise<T> {
      inFlight.add(controller);
      try {
        return await run(controller.signal);
      } finally {
        inFlight.delete(controller);
      }
    },
    dispose(): void {
      for (const c of inFlight) c.abort();
      inFlight.clear();
    },
  };
}
