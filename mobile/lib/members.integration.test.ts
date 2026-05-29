import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { fetchMembers, type Member } from "./members";

// Integration tests: fetchMembers against a real local HTTP server over a real
// fetch round-trip. No mocks — a throwaway server stands in for the backend so
// the test is hermetic and CI-friendly. (A full end-to-end against the real
// backend is a separate, heavier CI concern.)

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

async function startServer(
  handler: Handler,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr === null || typeof addr === "string") {
    throw new Error("server has no port");
  }
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

const GROUP = "11111111-1111-1111-1111-111111111111";

test("requests the group members path and returns parsed members", async () => {
  let requestedPath = "";
  const member: Member = { id: "a", name: "Ada", role: "core" };
  const server = await startServer((req, res) => {
    requestedPath = req.url ?? "";
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([member]));
  });
  try {
    const members = await fetchMembers(server.url, GROUP);
    assert.equal(requestedPath, `/groups/${GROUP}/members`);
    assert.deepEqual(members, [member]);
  } finally {
    await server.close();
  }
});

test("throws on a non-2xx response", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 500;
    res.end("boom");
  });
  try {
    await assert.rejects(fetchMembers(server.url, GROUP), /request failed: 500/);
  } finally {
    await server.close();
  }
});

test("throws when the payload fails validation", async () => {
  const server = await startServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ id: "a", name: "Ada", role: "admin" }]));
  });
  try {
    await assert.rejects(fetchMembers(server.url, GROUP), /role/);
  } finally {
    await server.close();
  }
});

test("aborts the request when the signal fires", async () => {
  const server = await startServer((_req, res) => {
    // Never respond, so only an abort can settle the promise.
    void res;
  });
  try {
    const controller = new AbortController();
    const pending = fetchMembers(server.url, GROUP, controller.signal);
    controller.abort();
    await assert.rejects(pending, (err: Error) => err.name === "AbortError");
  } finally {
    await server.close();
  }
});
