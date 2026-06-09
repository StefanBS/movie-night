import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createNight, addAttendee, removeAttendee, getNightTurn, getNight, type Night } from "./nights";

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

async function startServer(handler: Handler): Promise<{ url: string; close: () => Promise<void> }> {
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
const NIGHT = "n1";
const ADA = "a0000000-0000-0000-0000-000000000001";

const night: Night = {
  id: NIGHT,
  scheduledFor: "2026-06-12",
  attendees: [{ id: ADA, name: "Ada", role: "core" }],
};

function collect(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

test("createNight posts scheduledFor + attendees and parses the night", async () => {
  let path = "";
  let method = "";
  let body = "";
  const server = await startServer(async (req, res) => {
    path = req.url ?? "";
    method = req.method ?? "";
    body = await collect(req);
    res.statusCode = 201;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(night));
  });
  try {
    const got = await createNight(server.url, GROUP, "2026-06-12", [ADA]);
    assert.equal(method, "POST");
    assert.equal(path, `/groups/${GROUP}/nights`);
    assert.deepEqual(JSON.parse(body), { scheduledFor: "2026-06-12", attendees: [ADA] });
    assert.deepEqual(got, night);
  } finally {
    await server.close();
  }
});

test("addAttendee posts the userId to the attendees path", async () => {
  let path = "";
  let method = "";
  let body = "";
  const server = await startServer(async (req, res) => {
    path = req.url ?? "";
    method = req.method ?? "";
    body = await collect(req);
    res.statusCode = 201;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(night));
  });
  try {
    await addAttendee(server.url, GROUP, NIGHT, ADA);
    assert.equal(method, "POST");
    assert.equal(path, `/groups/${GROUP}/nights/${NIGHT}/attendees`);
    assert.deepEqual(JSON.parse(body), { userId: ADA });
  } finally {
    await server.close();
  }
});

test("removeAttendee issues DELETE to the attendee path", async () => {
  let path = "";
  let method = "";
  const server = await startServer((req, res) => {
    path = req.url ?? "";
    method = req.method ?? "";
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ...night, attendees: [] }));
  });
  try {
    const got = await removeAttendee(server.url, GROUP, NIGHT, ADA);
    assert.equal(method, "DELETE");
    assert.equal(path, `/groups/${GROUP}/nights/${NIGHT}/attendees/${ADA}`);
    assert.deepEqual(got.attendees, []);
  } finally {
    await server.close();
  }
});

test("getNightTurn parses the ranking array", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ id: ADA, name: "Ada", role: "core", servedCount: 0, lastPickedOn: null }]));
  });
  try {
    const order = await getNightTurn(server.url, GROUP, NIGHT);
    assert.equal(order.length, 1);
    assert.equal(order[0].name, "Ada");
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
    await assert.rejects(createNight(server.url, GROUP, "2026-06-12", []), /request failed: 422/);
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
    const pending = createNight(server.url, GROUP, "2026-06-12", [], controller.signal);
    controller.abort();
    await assert.rejects(pending, (err: Error) => err.name === "AbortError");
  } finally {
    await server.close();
  }
});

test("throws when the 2xx payload fails validation", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 201;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: 42, scheduledFor: "2026-06-12", attendees: [] }));
  });
  try {
    await assert.rejects(createNight(server.url, GROUP, "2026-06-12", []), /id/);
  } finally {
    await server.close();
  }
});

test("getNight fetches the night by id and parses it", async () => {
  let path = "";
  let method = "";
  const server = await startServer((req, res) => {
    path = req.url ?? "";
    method = req.method ?? "";
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(night));
  });
  try {
    const got = await getNight(server.url, GROUP, NIGHT);
    assert.equal(method, "GET");
    assert.equal(path, `/groups/${GROUP}/nights/${NIGHT}`);
    assert.deepEqual(got, night);
  } finally {
    await server.close();
  }
});
