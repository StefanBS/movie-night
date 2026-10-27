import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createIdentitySession, type TokenStorage } from "./identity";
import type { Member } from "./members";

// Integration tests: the Identity module against a real local HTTP server over
// real fetch. A throwaway server stands in for the backend's identity routes,
// and the test drives the module only through the interface the app uses.

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void;

async function startServer(handler: Handler): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => handler(req, res, Buffer.concat(chunks).toString()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr === null || typeof addr === "string") {
    throw new Error("server has no port");
  }
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function json(res: http.ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

const GROUP = "g1";

const member = (id: string, status: "active" | "inactive" = "active", role: "core" | "guest" = "core"): Member => ({
  id,
  name: id,
  role,
  status,
  joinedOn: "2026-01-01",
});

// backend is a small fake of the identity routes plus the roster and join: it
// issues sequential tokens and forgets them on release.
function backend() {
  const roster = [member("ada"), member("blake"), member("zed", "inactive")];
  const tokens = new Map<string, string>(); // token → user id
  let issued = 0;
  const bearer = (req: http.IncomingMessage) => (req.headers.authorization ?? "").replace(/^Bearer /, "");
  const handler: Handler = (req, res, body) => {
    const key = `${req.method} ${req.url}`;
    if (key === `GET /groups/${GROUP}/members`) return json(res, 200, roster);
    if (key === `POST /groups/${GROUP}/members`) {
      const { name, role } = JSON.parse(body) as { name: string; role: "core" | "guest" };
      const m = { ...member(name, "active", role) };
      roster.push(m);
      return json(res, 201, m);
    }
    if (key === "POST /identity") {
      const { userId } = JSON.parse(body) as { userId: string };
      const m = roster.find((r) => r.id === userId);
      if (m === undefined) return json(res, 404, { error: "member not found" });
      const token = `t${++issued}`;
      tokens.set(token, userId);
      return json(res, 201, { token, identity: { id: m.id, name: m.name } });
    }
    if (key === "GET /identity") {
      const userId = tokens.get(bearer(req));
      if (userId === undefined) return json(res, 401, { error: "unknown token" });
      return json(res, 200, { id: userId, name: userId });
    }
    if (key === "DELETE /identity") {
      tokens.delete(bearer(req));
      res.statusCode = 204;
      return res.end();
    }
    json(res, 404, { error: `unexpected ${key}` });
  };
  return { handler, roster, tokens };
}

// memoryStorage is a TokenStorage held in a variable — the in-process stand-in
// for the device keychain.
function memoryStorage(initial: string | null = null): TokenStorage & { value: string | null } {
  const s = {
    value: initial,
    get: async () => s.value,
    set: async (token: string) => {
      s.value = token;
    },
    remove: async () => {
      s.value = null;
    },
  };
  return s;
}

test("a fresh install shows the active roster, then claims and stores the token", async () => {
  const fake = backend();
  const server = await startServer(fake.handler);
  const storage = memoryStorage();
  try {
    const session = createIdentitySession({ baseUrl: server.url, groupId: GROUP, storage });
    await session.load();
    assert.equal(session.state.status, "unclaimed");
    assert.deepEqual(
      session.state.members.map((m) => m.id),
      ["ada", "blake"],
      "inactive members can't be claimed",
    );

    await session.claim("ada");
    assert.equal(session.state.status, "claimed");
    assert.deepEqual(session.state.identity, { id: "ada", name: "ada" });
    assert.equal(storage.value, "t1");
  } finally {
    await server.close();
  }
});

test("a stored token survives a restart", async () => {
  const fake = backend();
  fake.tokens.set("kept", "blake");
  const server = await startServer(fake.handler);
  try {
    const session = createIdentitySession({ baseUrl: server.url, groupId: GROUP, storage: memoryStorage("kept") });
    await session.load();
    assert.equal(session.state.status, "claimed");
    assert.deepEqual(session.state.identity, { id: "blake", name: "blake" });
  } finally {
    await server.close();
  }
});

test("a token the backend no longer knows is dropped and the roster shown", async () => {
  const server = await startServer(backend().handler);
  const storage = memoryStorage("stale");
  try {
    const session = createIdentitySession({ baseUrl: server.url, groupId: GROUP, storage });
    await session.load();
    assert.equal(session.state.status, "unclaimed");
    assert.equal(storage.value, null);
  } finally {
    await server.close();
  }
});

test("a failed check keeps the token so a retry can succeed", async () => {
  const fake = backend();
  fake.tokens.set("kept", "ada");
  let down = true;
  const server = await startServer((req, res, body) =>
    down ? json(res, 503, { error: "backend down" }) : fake.handler(req, res, body),
  );
  const storage = memoryStorage("kept");
  try {
    const session = createIdentitySession({ baseUrl: server.url, groupId: GROUP, storage });
    await session.load();
    assert.equal(session.state.status, "failed");
    assert.equal(session.state.error, "backend down");
    assert.equal(storage.value, "kept");

    down = false;
    await session.load();
    assert.equal(session.state.status, "claimed");
  } finally {
    await server.close();
  }
});

test("joinAndClaim adds a guest and claims them", async () => {
  const fake = backend();
  const server = await startServer(fake.handler);
  const storage = memoryStorage();
  try {
    const session = createIdentitySession({ baseUrl: server.url, groupId: GROUP, storage });
    await session.load();
    await session.joinAndClaim("Jess");
    assert.equal(session.state.status, "claimed");
    assert.deepEqual(session.state.identity, { id: "Jess", name: "Jess" });
    assert.equal(fake.roster.find((m) => m.id === "Jess")?.role, "guest");
  } finally {
    await server.close();
  }
});

test("release revokes the token and returns to the roster", async () => {
  const fake = backend();
  const server = await startServer(fake.handler);
  const storage = memoryStorage();
  try {
    const session = createIdentitySession({ baseUrl: server.url, groupId: GROUP, storage });
    await session.load();
    await session.claim("ada");
    await session.release();
    assert.equal(session.state.status, "unclaimed");
    assert.equal(session.state.identity, null);
    assert.equal(storage.value, null);
    assert.equal(fake.tokens.size, 0, "the backend forgot the token");
  } finally {
    await server.close();
  }
});

test("a refused claim reports the error and stays unclaimed", async () => {
  const server = await startServer(backend().handler);
  const storage = memoryStorage();
  try {
    const session = createIdentitySession({ baseUrl: server.url, groupId: GROUP, storage });
    await session.load();
    await session.claim("nobody");
    assert.equal(session.state.status, "unclaimed");
    assert.equal(session.state.actionError, "member not found");
    assert.equal(session.state.busy, false);
    assert.equal(storage.value, null);
  } finally {
    await server.close();
  }
});
