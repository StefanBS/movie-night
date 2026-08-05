import Constants from "expo-constants";

import { resolveApiBaseUrl } from "./lib/api";

// API_URL is the backend base URL for this running app, resolved once at import.
//
// This lives outside lib/ on purpose: reading Expo's hostUri needs
// `expo-constants`, and lib/ is kept framework-free so its modules stay
// unit-testable under bare `node:test` (see lib/api.test.ts). The decision
// itself is the pure, tested `resolveApiBaseUrl`; this module is only the
// wiring that feeds it the two runtime values.
export const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});
