import { safeIncomingPath } from "../lib/deepLink";

// Expo Router calls this for every native incoming link before parsing it.
// Throwing here can crash the app, so fail closed to home.
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    return safeIncomingPath(path, initial);
  } catch {
    return "/";
  }
}
