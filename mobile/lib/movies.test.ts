import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { formatRuntime, formatYearRuntime, movieDetails, parseMovie, searchMovies, type Movie } from "./movies";

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
  const m = parseMovie({
    tmdbId: 438631,
    title: "Dune",
    releaseYear: 2021,
    posterUrl: "https://img/x.jpg",
    genres: ["Science Fiction", "Adventure"],
    runtimeMinutes: 155,
  });
  assert.deepEqual(m, {
    tmdbId: 438631,
    title: "Dune",
    releaseYear: 2021,
    posterUrl: "https://img/x.jpg",
    genres: ["Science Fiction", "Adventure"],
    runtimeMinutes: 155,
  });
});

test("parseMovie defaults absent or null genres and runtimeMinutes", () => {
  const cases: [string, Record<string, unknown>, string[], number | null][] = [
    ["absent (older backend)", {}, [], null],
    ["search result shape", { genres: [], runtimeMinutes: null }, [], null],
    ["null genres", { genres: null }, [], null],
    ["present", { genres: ["Drama"], runtimeMinutes: 98 }, ["Drama"], 98],
  ];
  for (const [name, extra, genres, runtimeMinutes] of cases) {
    const m = parseMovie({ tmdbId: 1, title: "X", ...extra });
    assert.deepEqual(m.genres, genres, name);
    assert.equal(m.runtimeMinutes, runtimeMinutes, name);
  }
});

test("parseMovie rejects wrong-typed genres and runtimeMinutes", () => {
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ["genres not an array", { genres: "Drama" }, /genres/],
    ["a genre not a string", { genres: ["Drama", 18] }, /genres/],
    ["runtimeMinutes a string", { runtimeMinutes: "98" }, /runtimeMinutes/],
  ];
  for (const [name, extra, err] of cases) {
    assert.throws(() => parseMovie({ tmdbId: 1, title: "X", ...extra }), err, name);
  }
});

test("parseMovie treats null and missing releaseYear as null", () => {
  assert.equal(parseMovie({ tmdbId: 1, title: "X", releaseYear: null }).releaseYear, null);
  assert.equal(parseMovie({ tmdbId: 1, title: "X" }).releaseYear, null);
});

test("parseMovie treats null and missing posterUrl as null", () => {
  assert.equal(parseMovie({ tmdbId: 1, title: "X", posterUrl: null }).posterUrl, null);
  assert.equal(parseMovie({ tmdbId: 1, title: "X" }).posterUrl, null);
});

test("parseMovie rejects a non-string posterUrl", () => {
  assert.throws(() => parseMovie({ tmdbId: 1, title: "X", posterUrl: 5 }), /posterUrl/);
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

test("formatRuntime", () => {
  const cases: { minutes: number; want: string }[] = [
    { minutes: 98, want: "1h 38m" },
    { minutes: 45, want: "45m" },
    { minutes: 120, want: "2h" },
    { minutes: 60, want: "1h" },
    { minutes: 61, want: "1h 1m" },
    { minutes: 1, want: "1m" },
  ];
  for (const { minutes, want } of cases) {
    assert.equal(formatRuntime(minutes), want, `${minutes} minutes`);
  }
});

test("movieDetails tags each line with its kind", () => {
  const movie: Movie = { tmdbId: 1, title: "In the Mood for Love", releaseYear: 2000, posterUrl: null, genres: ["Drama"], runtimeMinutes: 98 };
  assert.deepEqual(
    movieDetails(movie).map((d) => d.kind),
    ["year", "genres", "runtime"],
  );
});

test("movieDetails", () => {
  const base: Movie = { tmdbId: 1, title: "In the Mood for Love", releaseYear: null, posterUrl: null, genres: [], runtimeMinutes: null };
  const cases: { name: string; movie: Partial<Movie>; want: string[] }[] = [
    {
      name: "all three",
      movie: { releaseYear: 2000, genres: ["Drama", "Romance"], runtimeMinutes: 98 },
      want: ["2000", "Drama, Romance", "1h 38m"],
    },
    { name: "no genres", movie: { releaseYear: 2000, runtimeMinutes: 98 }, want: ["2000", "1h 38m"] },
    { name: "no runtime", movie: { releaseYear: 2000, genres: ["Drama"] }, want: ["2000", "Drama"] },
    { name: "no year", movie: { genres: ["Drama"], runtimeMinutes: 45 }, want: ["Drama", "45m"] },
    { name: "none", movie: {}, want: [] },
    { name: "zero runtime is unknown", movie: { releaseYear: 2000, runtimeMinutes: 0 }, want: ["2000"] },
    { name: "blank genre names dropped", movie: { genres: ["", "Drama"] }, want: ["Drama"] },
  ];
  for (const { name, movie, want } of cases) {
    assert.deepEqual(
      movieDetails({ ...base, ...movie }).map((d) => d.text),
      want,
      name,
    );
  }
});

test("formatYearRuntime", () => {
  const base: Movie = { tmdbId: 1, title: "Past Lives", releaseYear: null, posterUrl: null, genres: ["Drama"], runtimeMinutes: null };
  const cases: { name: string; movie: Partial<Movie>; want: string }[] = [
    { name: "both", movie: { releaseYear: 2023, runtimeMinutes: 106 }, want: "2023 · 1h 46m" },
    { name: "year only", movie: { releaseYear: 2023 }, want: "2023" },
    { name: "runtime only", movie: { runtimeMinutes: 106 }, want: "1h 46m" },
    { name: "zero runtime is unknown", movie: { releaseYear: 2023, runtimeMinutes: 0 }, want: "2023" },
    { name: "neither", movie: {}, want: "" },
  ];
  for (const c of cases) {
    assert.equal(formatYearRuntime({ ...base, ...c.movie }), c.want, c.name);
  }
});
