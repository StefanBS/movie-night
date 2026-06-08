import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {
  addMember,
  deactivateMember,
  fetchMembers,
  promoteMember,
  reactivateMember,
  type Member,
} from "./members";

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
const USER = "a0000000-0000-0000-0000-000000000006";

async function capture(
  status: number,
  member: Member,
  call: (url: string) => Promise<Member>,
): Promise<{ method: string; path: string; body: string; result: Member }> {
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
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(member));
    });
  });
  try {
    const result = await call(server.url);
    return { method, path, body, result };
  } finally {
    await server.close();
  }
}

test("addMember posts {name} to the members path and returns the member", async () => {
  const created: Member = { id: "u1", name: "Newbie", role: "core", status: "active" };
  const { method, path, body, result } = await capture(201, created, (url) =>
    addMember(url, GROUP, "Newbie"),
  );
  assert.equal(method, "POST");
  assert.equal(path, `/groups/${GROUP}/members`);
  assert.deepEqual(JSON.parse(body), { name: "Newbie" });
  assert.deepEqual(result, created);
});

test("deactivateMember posts to the deactivate path with no body", async () => {
  const m: Member = { id: USER, name: "Frankie", role: "guest", status: "inactive" };
  const { method, path, body, result } = await capture(200, m, (url) =>
    deactivateMember(url, GROUP, USER),
  );
  assert.equal(method, "POST");
  assert.equal(path, `/groups/${GROUP}/members/${USER}/deactivate`);
  assert.equal(body, "");
  assert.deepEqual(result, m);
});

test("reactivateMember posts to the reactivate path", async () => {
  const m: Member = { id: USER, name: "Frankie", role: "core", status: "active" };
  const { path } = await capture(200, m, (url) => reactivateMember(url, GROUP, USER));
  assert.equal(path, `/groups/${GROUP}/members/${USER}/reactivate`);
});

test("promoteMember posts to the promote path", async () => {
  const m: Member = { id: USER, name: "Frankie", role: "core", status: "active" };
  const { path } = await capture(200, m, (url) => promoteMember(url, GROUP, USER));
  assert.equal(path, `/groups/${GROUP}/members/${USER}/promote`);
});

test("a write op throws on a non-2xx response", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 404;
    res.end("nope");
  });
  try {
    await assert.rejects(
      deactivateMember(server.url, GROUP, USER),
      /request failed: 404/,
    );
  } finally {
    await server.close();
  }
});

test("requests the group members path and returns parsed members", async () => {
  let requestedPath = "";
  const member: Member = { id: "a", name: "Ada", role: "core", status: "active" };
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

test("fetchMembers throws on a non-2xx response", async () => {
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

test("fetchMembers throws when the payload fails validation", async () => {
  const server = await startServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ id: "a", name: "Ada", role: "admin", status: "active" }]));
  });
  try {
    await assert.rejects(fetchMembers(server.url, GROUP), /role/);
  } finally {
    await server.close();
  }
});

test("fetchMembers aborts the request when the signal fires", async () => {
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
