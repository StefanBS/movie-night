import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { parseMovie, searchMovies } from "./movies";

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
      new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

test("parseMovie accepts a valid movie", () => {
  const m = parseMovie({ tmdbId: 438631, title: "Dune", releaseYear: 2021 });
  assert.deepEqual(m, { tmdbId: 438631, title: "Dune", releaseYear: 2021 });
});

test("parseMovie treats null and missing releaseYear as null", () => {
  assert.equal(parseMovie({ tmdbId: 1, title: "X", releaseYear: null }).releaseYear, null);
  assert.equal(parseMovie({ tmdbId: 1, title: "X" }).releaseYear, null);
});

test("parseMovie rejects bad shapes", () => {
  assert.throws(() => parseMovie(null), /movie object/);
  assert.throws(() => parseMovie({ tmdbId: "x", title: "X" }), /tmdbId/);
  assert.throws(() => parseMovie({ tmdbId: 1, title: 2 }), /title/);
  assert.throws(() => parseMovie({ tmdbId: 1, title: "X", releaseYear: "2021" }), /releaseYear/);
});

test("searchMovies hits the search path with the query and parses results", async () => {
  let path = "";
  const server = await startServer((req, res) => {
    path = req.url ?? "";
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ tmdbId: 438631, title: "Dune", releaseYear: 2021 }]));
  });
  try {
    const got = await searchMovies(server.url, "dune two");
    assert.equal(path, "/movies/search?q=dune%20two");
    assert.equal(got.length, 1);
    assert.equal(got[0].title, "Dune");
  } finally {
    await server.close();
  }
});

test("searchMovies throws on a non-2xx response", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 503;
    res.end("nope");
  });
  try {
    await assert.rejects(searchMovies(server.url, "dune"), /request failed: 503/);
  } finally {
    await server.close();
  }
});
