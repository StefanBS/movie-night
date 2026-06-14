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
    throw new Error(`request failed: ${res.status}`);
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
    throw new Error(`request failed: ${res.status}`);
  }
  return parse(await res.json());
}
