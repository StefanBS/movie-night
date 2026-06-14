// errorFor builds the error for a non-2xx response. The backend writes a
// `{"error": "..."}` JSON body (see backend writeJSONError), so surfacing that
// message lets callers distinguish, e.g., a 503 "movie search is not
// configured" from a 502 upstream failure — which a bare status code can't.
// It falls back to the status code when the body isn't a usable error payload.
async function errorFor(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error !== "") {
      return new Error(body.error);
    }
  } catch {
    // Non-JSON or empty body — fall through to the status code.
  }
  return new Error(`request failed: ${res.status}`);
}

// requestJson is the single fetch boundary for the backend: it performs the
// request, rejects a non-2xx response with a descriptive error, and runs the
// caller's parser over the decoded JSON so the untrusted payload is validated,
// not just asserted. Every resource client (members, nights, turn, movies)
// goes through here so the ok-check and error shape live in one place.
export async function requestJson<T>(
  url: string,
  parse: (raw: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw await errorFor(res);
  }
  return parse(await res.json());
}

// requestJsonOrNull is requestJson for endpoints that signal "no resource" with
// a 404 (e.g. a group's current night before one exists) — that case returns
// null instead of throwing; any other non-2xx still rejects.
export async function requestJsonOrNull<T>(
  url: string,
  parse: (raw: unknown) => T,
  init?: RequestInit,
): Promise<T | null> {
  const res = await fetch(url, init);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw await errorFor(res);
  }
  return parse(await res.json());
}
