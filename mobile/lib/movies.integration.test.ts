import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { searchMovies } from "./movies";
import { attachMovie, type Night } from "./nights";

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

function collect(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

const GROUP = "11111111-1111-1111-1111-111111111111";
const NIGHT = "n1";

test("searchMovies fetches from the search path and parses the result array", async () => {
  let path = "";
  let method = "";
  const server = await startServer((req, res) => {
    path = req.url ?? "";
    method = req.method ?? "";
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify([
        { tmdbId: 438631, title: "Dune", releaseYear: 2021 },
        { tmdbId: 693134, title: "Dune: Part Two", releaseYear: 2024 },
      ]),
    );
  });
  try {
    const got = await searchMovies(server.url, "dune");
    assert.equal(method, "GET");
    assert.equal(path, "/movies/search?q=dune");
    assert.equal(got.length, 2);
    assert.equal(got[0].tmdbId, 438631);
    assert.equal(got[1].title, "Dune: Part Two");
    assert.equal(got[1].releaseYear, 2024);
  } finally {
    await server.close();
  }
});

test("searchMovies handles a movie with null releaseYear", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ tmdbId: 1, title: "Unknown", releaseYear: null }]));
  });
  try {
    const got = await searchMovies(server.url, "unknown");
    assert.equal(got[0].releaseYear, null);
  } finally {
    await server.close();
  }
});

test("attachMovie posts the tmdbId and returns the night with its movie", async () => {
  const nightWithMovie: Night = {
    id: NIGHT,
    scheduledFor: "2026-06-12",
    pickerId: null,
    movie: { tmdbId: 438631, title: "Dune", releaseYear: 2021 },
    attendees: [],
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
    res.end(JSON.stringify(nightWithMovie));
  });
  try {
    const got = await attachMovie(server.url, GROUP, NIGHT, 438631);
    assert.equal(method, "POST");
    assert.equal(path, `/groups/${GROUP}/nights/${NIGHT}/movie`);
    assert.deepEqual(JSON.parse(body), { tmdbId: 438631 });
    assert.deepEqual(got.movie, { tmdbId: 438631, title: "Dune", releaseYear: 2021 });
  } finally {
    await server.close();
  }
});
