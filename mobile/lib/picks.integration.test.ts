import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { recordPick, type Pick } from "./picks";

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
const PICKER = "a0000000-0000-0000-0000-000000000001";

test("posts the pick body to the picks path and returns the created pick", async () => {
  let requestedPath = "";
  let method = "";
  let body = "";
  const created: Pick = {
    id: "c1",
    groupId: GROUP,
    pickerId: PICKER,
    isCredited: true,
    scheduledFor: "2026-06-02",
    createdAt: "2026-06-02T15:04:05Z",
  };
  const server = await startServer((req, res) => {
    requestedPath = req.url ?? "";
    method = req.method ?? "";
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      body = Buffer.concat(chunks).toString();
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(created));
    });
  });
  try {
    const pick = await recordPick(server.url, GROUP, {
      pickerId: PICKER,
      scheduledFor: "2026-06-02",
      isCredited: true,
    });
    assert.equal(method, "POST");
    assert.equal(requestedPath, `/groups/${GROUP}/picks`);
    assert.deepEqual(JSON.parse(body), {
      pickerId: PICKER,
      scheduledFor: "2026-06-02",
      isCredited: true,
    });
    assert.deepEqual(pick, created);
  } finally {
    await server.close();
  }
});

test("throws on a non-2xx response", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 422;
    res.end("nope");
  });
  try {
    await assert.rejects(
      recordPick(server.url, GROUP, { pickerId: PICKER, scheduledFor: "2026-06-02" }),
      /request failed: 422/,
    );
  } finally {
    await server.close();
  }
});

test("throws when the 201 payload fails validation", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 201;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        id: "c1",
        groupId: GROUP,
        pickerId: PICKER,
        isCredited: "yes",
        scheduledFor: "2026-06-02",
        createdAt: "2026-06-02T15:04:05Z",
      }),
    );
  });
  try {
    await assert.rejects(
      recordPick(server.url, GROUP, { pickerId: PICKER, scheduledFor: "2026-06-02" }),
      /isCredited/,
    );
  } finally {
    await server.close();
  }
});

test("aborts the request when the signal fires", async () => {
  const server = await startServer((_req, res) => {
    void res; // never respond, so only an abort can settle the promise
  });
  try {
    const controller = new AbortController();
    const pending = recordPick(
      server.url,
      GROUP,
      { pickerId: PICKER, scheduledFor: "2026-06-02" },
      controller.signal,
    );
    controller.abort();
    await assert.rejects(pending, (err: Error) => err.name === "AbortError");
  } finally {
    await server.close();
  }
});
