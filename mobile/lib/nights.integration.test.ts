import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {
  createNight,
  getNightTurn,
  listNights,
  recordNightPick,
  attachMovie,
  type Night,
} from "./nights";

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
  pickerId: ADA,
  movie: null,
  attendees: [{ id: ADA, name: "Ada", role: "core" }],
};

function collect(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

const NEW_NIGHT = { scheduledFor: "2026-06-12", attendees: [ADA], pickerId: ADA };

test("createNight posts the date, attendees and picker and parses the night", async () => {
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
    const got = await createNight(server.url, GROUP, NEW_NIGHT);
    assert.equal(method, "POST");
    assert.equal(path, `/groups/${GROUP}/nights`);
    assert.deepEqual(JSON.parse(body), { scheduledFor: "2026-06-12", attendees: [ADA], pickerId: ADA });
    assert.deepEqual(got, night);
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
    await assert.rejects(createNight(server.url, GROUP, NEW_NIGHT), /request failed: 422/);
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
    const pending = createNight(server.url, GROUP, NEW_NIGHT, controller.signal);
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
    await assert.rejects(createNight(server.url, GROUP, NEW_NIGHT), /id/);
  } finally {
    await server.close();
  }
});

test("createNight surfaces the backend's message for a taken date (409)", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 409;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "there is already a night on that date" }));
  });
  try {
    await assert.rejects(createNight(server.url, GROUP, NEW_NIGHT), /already a night on that date/);
  } finally {
    await server.close();
  }
});

test("recordNightPick posts the pickerId and parses the night", async () => {
  let path = "";
  let method = "";
  let body = "";
  const nightWithPicker: Night = { ...night, pickerId: "a0000000-0000-0000-0000-000000000002" };
  const server = await startServer(async (req, res) => {
    path = req.url ?? "";
    method = req.method ?? "";
    body = await collect(req);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(nightWithPicker));
  });
  try {
    const got = await recordNightPick(server.url, GROUP, NIGHT, nightWithPicker.pickerId);
    assert.equal(method, "POST");
    assert.equal(path, `/groups/${GROUP}/nights/${NIGHT}/pick`);
    assert.deepEqual(JSON.parse(body), { pickerId: nightWithPicker.pickerId });
    assert.deepEqual(got, nightWithPicker);
  } finally {
    await server.close();
  }
});

test("attachMovie posts the tmdbId and parses the night with its movie", async () => {
  const withMovie: Night = {
    ...night,
    movie: { tmdbId: 438631, title: "Dune", releaseYear: 2021, posterUrl: "https://image.tmdb.org/t/p/w342/dune.jpg" },
  };
  let path = "";
  let method = "";
  let body = "";
  const server = await startServer(async (req, res) => {
    path = req.url ?? "";
    method = req.method ?? "";
    body = await collect(req);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(withMovie));
  });
  try {
    const got = await attachMovie(server.url, GROUP, NIGHT, 438631);
    assert.equal(method, "POST");
    assert.equal(path, `/groups/${GROUP}/nights/${NIGHT}/movie`);
    assert.deepEqual(JSON.parse(body), { tmdbId: 438631 });
    assert.deepEqual(got.movie, { tmdbId: 438631, title: "Dune", releaseYear: 2021, posterUrl: "https://image.tmdb.org/t/p/w342/dune.jpg" });
  } finally {
    await server.close();
  }
});

test("listNights GETs the group's nights and parses the array", async () => {
  let path = "";
  const server = await startServer((req, res) => {
    path = req.url ?? "";
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify([night, { ...night, id: "n2", scheduledFor: "2026-07-01" }]));
  });
  try {
    const got = await listNights(server.url, GROUP);
    assert.equal(path, `/groups/${GROUP}/nights`);
    assert.equal(got.length, 2);
    assert.equal(got[0].id, "n1");
    assert.equal(got[1].id, "n2");
  } finally {
    await server.close();
  }
});
