const DEFAULT_API_URL = "http://localhost:8080";
const BACKEND_PORT = 8080;

// GROUP_ID is the seeded "Friday Film Club" group shared across the backend
// seed, this app, and the backend integration test (the shared contract).
export const GROUP_ID = "11111111-1111-1111-1111-111111111111";

// resolveGroupId returns the active group, or null when none is resolved (which
// is when the Welcome / first-run screen is shown). Until group create/join
// exists, it always returns the seeded group.
// TODO(group-onboarding): read the persisted/selected group here; a null result
// routes the app to /welcome (no redirect is wired yet — see app/welcome.tsx).
export function resolveGroupId(): string | null {
  return GROUP_ID;
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1";
}

// RN's URL implementation is incomplete, so parse the hostname by hand.
function isLoopbackUrl(url: string): boolean {
  const host = url.match(/^[a-z]+:\/\/([^/:]+)/i)?.[1];
  return host !== undefined && isLoopbackHost(host);
}

// resolveApiBaseUrl decides which backend URL the app should call.
//
//   envUrl   - EXPO_PUBLIC_API_URL, the configured value (may be undefined).
//   hostUri  - "ip:port" the device used to reach Metro (Expo dev only).
//
// Precedence:
//   1. An explicit non-loopback envUrl wins. This is how a CI/CD build points
//      production and staging at the real backend.
//   2. Otherwise, on a physical device in dev, derive the dev machine's LAN
//      host from hostUri so the phone can reach the backend on that machine
//      (localhost would mean the phone itself).
//   3. Otherwise fall back to the configured URL or the localhost default,
//      which is correct for the simulator and web.
//
// Tunnel mode (expo start --tunnel) is not auto-detected; set
// EXPO_PUBLIC_API_URL explicitly to use case 1 there.
export function resolveApiBaseUrl(opts: {
  envUrl?: string;
  hostUri?: string;
}): string {
  const { envUrl, hostUri } = opts;

  if (envUrl && !isLoopbackUrl(envUrl)) {
    return envUrl;
  }

  const host = hostUri?.split(":")[0];
  if (host && !isLoopbackHost(host)) {
    return `http://${host}:${BACKEND_PORT}`;
  }

  return envUrl ?? DEFAULT_API_URL;
}
