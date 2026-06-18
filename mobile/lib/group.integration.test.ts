import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { fetchGroup, renameGroup, type Group } from "./group";

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

test("fetchGroup requests the group path and returns the parsed group", async () => {
  const group: Group = { name: "Friday Film Club", createdOn: "2026-05-01" };
  let requestedPath = "";
  let method = "";
  const server = await startServer((req, res) => {
    requestedPath = req.url ?? "";
    method = req.method ?? "";
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(group));
  });
  try {
    const got = await fetchGroup(server.url, GROUP);
    assert.equal(method, "GET");
    assert.equal(requestedPath, `/groups/${GROUP}`);
    assert.deepEqual(got, group);
  } finally {
    await server.close();
  }
});

test("renameGroup PATCHes {name} to the group path and returns the updated group", async () => {
  const updated: Group = { name: "Saturday Cinema", createdOn: "2026-05-01" };
  let method = "";
  let path = "";
  let body = "";
  const server = await startServer((req, res) => {
    method = req.method ?? "";
    path = req.url ?? "";
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      body = Buffer.concat(chunks).toString();
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(updated));
    });
  });
  try {
    const got = await renameGroup(server.url, GROUP, "Saturday Cinema");
    assert.equal(method, "PATCH");
    assert.equal(path, `/groups/${GROUP}`);
    assert.deepEqual(JSON.parse(body), { name: "Saturday Cinema" });
    assert.deepEqual(got, updated);
  } finally {
    await server.close();
  }
});

test("fetchGroup throws on a non-2xx response", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 404;
    res.end("nope");
  });
  try {
    await assert.rejects(fetchGroup(server.url, GROUP), /request failed: 404/);
  } finally {
    await server.close();
  }
});

test("renameGroup surfaces the backend error message on a non-2xx", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 400;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "name is required" }));
  });
  try {
    await assert.rejects(renameGroup(server.url, GROUP, ""), /name is required/);
  } finally {
    await server.close();
  }
});
