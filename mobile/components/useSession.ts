import { useEffect, useState, useSyncExternalStore } from "react";

import type { Session } from "../lib/session";

// useSession creates a framework-free session (lib/nightPlan, lib/nightEditor,
// lib/nightEdit, lib/nightLoad) once per mount, re-renders on its changes, and
// aborts its in-flight requests on unmount. Returns the session (for commands)
// and its current state.
export function useSession<T extends Session<unknown>>(create: () => T): [T, T["state"]] {
  const [session] = useState(create);
  const state = useSyncExternalStore(session.subscribe, () => session.state as T["state"]);
  useEffect(() => () => session.dispose(), [session]);
  return [session, state];
}
