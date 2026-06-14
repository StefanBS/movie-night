import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { requestJson, requestJsonOrNull } from "./http";

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void | Promise<void>;

async function startServer(handler: Handler): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    void handler(req, res);
  });
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

const identity = (raw: unknown): unknown => raw;

test("requestJson surfaces the backend's error message on a non-2xx JSON body", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "movie search is not configured" }));
  });
  try {
    await assert.rejects(requestJson(server.url, identity), {
      message: "movie search is not configured",
    });
  } finally {
    await server.close();
  }
});

test("requestJson distinguishes a 502 upstream failure from a 503 by message", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "movie search failed" }));
  });
  try {
    await assert.rejects(requestJson(server.url, identity), {
      message: "movie search failed",
    });
  } finally {
    await server.close();
  }
});

test("requestJson falls back to the status code when the error body is not usable", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain");
    res.end("internal error");
  });
  try {
    await assert.rejects(requestJson(server.url, identity), {
      message: "request failed: 500",
    });
  } finally {
    await server.close();
  }
});

test("requestJsonOrNull surfaces the backend's error message on a non-2xx, non-404 body", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "movie search is not configured" }));
  });
  try {
    await assert.rejects(requestJsonOrNull(server.url, identity), {
      message: "movie search is not configured",
    });
  } finally {
    await server.close();
  }
});

test("requestJsonOrNull still maps a 404 to null", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  try {
    assert.equal(await requestJsonOrNull(server.url, identity), null);
  } finally {
    await server.close();
  }
});
