import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveApiBaseUrl } from "./api";

// Table-driven, like the Go backend's tests. resolveApiBaseUrl decides which
// backend URL the app should call, given the configured EXPO_PUBLIC_API_URL
// (envUrl) and the host the device used to reach Metro (hostUri, from Expo).
const cases: {
  name: string;
  envUrl?: string;
  hostUri?: string;
  want: string;
}[] = [
  {
    name: "derives the dev machine LAN host from Expo hostUri (physical device)",
    envUrl: "http://localhost:8080",
    hostUri: "192.168.50.68:8081",
    want: "http://192.168.50.68:8080",
  },
  {
    name: "falls back to the configured localhost URL when there is no hostUri (simulator/web)",
    envUrl: "http://localhost:8080",
    hostUri: undefined,
    want: "http://localhost:8080",
  },
  {
    name: "an explicit non-loopback env URL wins (production/staging set by CI/CD)",
    envUrl: "https://api.movie-night.example",
    hostUri: "192.168.50.68:8081",
    want: "https://api.movie-night.example",
  },
  {
    name: "ignores a loopback hostUri and keeps the localhost default",
    envUrl: "http://localhost:8080",
    hostUri: "127.0.0.1:8081",
    want: "http://localhost:8080",
  },
  {
    name: "uses the built-in default when nothing is configured",
    envUrl: undefined,
    hostUri: undefined,
    want: "http://localhost:8080",
  },
];

for (const c of cases) {
  test(c.name, () => {
    assert.equal(
      resolveApiBaseUrl({ envUrl: c.envUrl, hostUri: c.hostUri }),
      c.want,
    );
  });
}
