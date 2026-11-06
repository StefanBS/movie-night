import { test } from "node:test";
import assert from "node:assert/strict";

import { searchMovies } from "./movies";
import { attachMovie } from "./nights";
import { aMovie, aNight } from "./fixtures";
import { startServer } from "./testServer";

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
        { ...aMovie(), watchedOn: "2026-05-02" },
        { ...aMovie({ tmdbId: 693134, title: "Dune: Part Two", releaseYear: 2024 }), watchedOn: null },
      ]),
    );
  });
  try {
    const got = await searchMovies(server.url, GROUP, NIGHT, "dune");
    assert.equal(method, "GET");
    assert.equal(path, `/groups/${GROUP}/movies/search?q=dune&exceptNight=${NIGHT}`);
    assert.equal(got.length, 2);
    assert.equal(got[0].tmdbId, 438631);
    assert.equal(got[1].title, "Dune: Part Two");
    assert.equal(got[1].releaseYear, 2024);
    assert.equal(got[0].watchedOn, "2026-05-02");
    assert.equal(got[1].watchedOn, null);
  } finally {
    await server.close();
  }
});

test("searchMovies handles a movie with null releaseYear", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ ...aMovie({ title: "Unknown", releaseYear: null }), watchedOn: null }]));
  });
  try {
    const got = await searchMovies(server.url, GROUP, NIGHT, "unknown");
    assert.equal(got[0].releaseYear, null);
  } finally {
    await server.close();
  }
});

test("attachMovie posts the tmdbId and returns the night with its movie", async () => {
  const dune = aMovie({
    posterUrl: "https://image.tmdb.org/t/p/w342/dune.jpg",
    posterThumbUrl: "https://image.tmdb.org/t/p/w154/dune.jpg",
    genres: ["Science Fiction", "Adventure"],
    runtimeMinutes: 155,
  });
  const nightWithMovie = aNight({
    id: NIGHT,
    movie: dune,
  });
  let path = "";
  let method = "";
  let body = "";
  const server = await startServer((req, res, reqBody) => {
    path = req.url ?? "";
    method = req.method ?? "";
    body = reqBody;
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(nightWithMovie));
  });
  try {
    const got = await attachMovie(server.url, GROUP, NIGHT, 438631);
    assert.equal(method, "POST");
    assert.equal(path, `/groups/${GROUP}/nights/${NIGHT}/movie`);
    assert.deepEqual(JSON.parse(body), { tmdbId: 438631 });
    assert.deepEqual(got.movie, dune);
  } finally {
    await server.close();
  }
});
