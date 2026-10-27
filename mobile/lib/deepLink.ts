// Incoming deep links reach expo-router's query parser. Up to SDK 57 that was
// query-string@7 > decode-uri-component@0.2.2, whose fallback for malformed
// percent-encoding is roughly cubic in the number of bad %XX tokens
// (GHSA-vcc3-ghjq-m6fr): ~200ms for 256 chars of "%FF", ~80s for 4KB. SDK 58's
// expo-router dropped that dependency; the guard stays as a cheap filter for
// links we'd never send: ones that fail native decoding, and anything over the
// length cap. Our longest real link is ~60 chars.
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
