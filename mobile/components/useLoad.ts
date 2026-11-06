import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import { errorMessage } from "../lib/errors";

// useLoad runs a screen's fetch and tracks it: `loading` gates only the first
// load, a later failure keeps the last good `data` beside its `error`, and the
// request is aborted when the screen blurs or unmounts. By default it refetches
// on every focus, since tab screens stay mounted and other screens (or phones)
// change what they show; `refetchOnFocus: false` loads once on mount. A new
// `key` (a route param) re-runs it. `setData` and `setError` let a screen fold
// in its own write's reply or failure.
export function useLoad<T>(
  load: (signal: AbortSignal) => Promise<T>,
  initial: T,
  fallback: string,
  { refetchOnFocus = true, key }: { refetchOnFocus?: boolean; key?: string } = {},
) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(load);
  useEffect(() => {
    latest.current = load;
  });

  const run = useCallback(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setData(await latest.current(controller.signal));
        setError(null);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(errorMessage(e, fallback));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
    // key re-runs the load; latest.current is read when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fallback]);

  useFocusEffect(useCallback(() => (refetchOnFocus ? run() : undefined), [run, refetchOnFocus]));
  useEffect(() => (refetchOnFocus ? undefined : run()), [run, refetchOnFocus]);

  return { data, setData, loading, error, setError };
}
