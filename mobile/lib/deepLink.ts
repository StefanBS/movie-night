// Incoming deep links reach expo-router's query parser (query-string@7 >
// decode-uri-component@0.2.2), whose fallback for malformed percent-encoding
// is roughly cubic in the number of bad %XX tokens (GHSA-vcc3-ghjq-m6fr):
// ~200ms for 256 chars of "%FF" on a desktop, ~80s for 4KB. The fallback only
// runs when the native decoder throws, so rejecting links that fail native
// decoding closes it; the length cap bounds everything else. Our longest real
// link is ~60 chars.
export const MAX_INCOMING_PATH_LENGTH = 2048;

// safeIncomingPath returns the path to route to for an incoming link, or null
// to stay on the current screen. An unsafe launch link opens home instead.
export function safeIncomingPath(path: string, initial: boolean): string | null {
  const reject = initial ? "/" : null;
  if (path.length > MAX_INCOMING_PATH_LENGTH) return reject;
  try {
    decodeURIComponent(path);
  } catch {
    return reject;
  }
  return path;
}
