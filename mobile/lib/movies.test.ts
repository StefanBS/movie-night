import { test } from "node:test";
import assert from "node:assert/strict";

import { formatRuntime, formatYearRuntime, movieDetails, parseMovie, parseSearchResults, searchMovies, type Movie } from "./movies";
import { startServer } from "./testServer";

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

const bare = { tmdbId: 1, title: "X", releaseYear: null, posterUrl: null, genres: [], runtimeMinutes: null };

test("parseMovie reads null fields as unknown", () => {
  assert.deepEqual(parseMovie(bare), bare);
});

test("parseMovie rejects missing or wrong-typed fields", () => {
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ["genres missing", { genres: undefined }, /genres/],
    ["genres null", { genres: null }, /genres/],
    ["genres not an array", { genres: "Drama" }, /genres/],
    ["a genre not a string", { genres: ["Drama", 18] }, /genres/],
    ["runtimeMinutes missing", { runtimeMinutes: undefined }, /runtimeMinutes/],
    ["runtimeMinutes a string", { runtimeMinutes: "98" }, /runtimeMinutes/],
    ["releaseYear missing", { releaseYear: undefined }, /releaseYear/],
    ["releaseYear a string", { releaseYear: "2021" }, /releaseYear/],
    ["posterUrl missing", { posterUrl: undefined }, /posterUrl/],
    ["posterUrl a number", { posterUrl: 5 }, /posterUrl/],
  ];
  for (const [name, extra, err] of cases) {
    assert.throws(() => parseMovie({ ...bare, ...extra }), err, name);
  }
});

test("parseMovie rejects bad shapes", () => {
  assert.throws(() => parseMovie(null), /movie object/);
  assert.throws(() => parseMovie({ tmdbId: "x", title: "X" }), /tmdbId/);
  assert.throws(() => parseMovie({ tmdbId: 1, title: 2 }), /title/);
});

test("parseSearchResults reads watchedOn, a date or null", () => {
  assert.deepEqual(parseSearchResults([{ ...bare, watchedOn: "2026-05-02" }, { ...bare, watchedOn: null }]), [
    { ...bare, watchedOn: "2026-05-02" },
    { ...bare, watchedOn: null },
  ]);
});

test("parseSearchResults rejects a bad payload", () => {
  const cases: [string, unknown, RegExp][] = [
    ["not an array", { results: [] }, /expected an array/],
    ["watchedOn missing", [bare], /watchedOn/],
    ["watchedOn a number", [{ ...bare, watchedOn: 20260502 }], /watchedOn/],
    ["a bad movie", [{ ...bare, title: 2, watchedOn: null }], /title/],
  ];
  for (const [name, raw, err] of cases) {
    assert.throws(() => parseSearchResults(raw), err, name);
  }
});

test("searchMovies hits the group's search path with the query and the Night to leave out", async () => {
  let path = "";
  const server = await startServer((req, res) => {
    path = req.url ?? "";
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ ...bare, tmdbId: 438631, title: "Dune", releaseYear: 2021, watchedOn: "2026-05-02" }]));
  });
  try {
    const got = await searchMovies(server.url, "g1", "n1", "dune two");
    assert.equal(path, "/groups/g1/movies/search?q=dune+two&exceptNight=n1");
    assert.equal(got.length, 1);
    assert.equal(got[0].title, "Dune");
    assert.equal(got[0].watchedOn, "2026-05-02");
  } finally {
    await server.close();
  }
});

test("formatRuntime", () => {
  const cases: { minutes: number; want: string }[] = [
    { minutes: 98, want: "1h 38m" },
    { minutes: 45, want: "45m" },
    { minutes: 120, want: "2h" },
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
    { name: "neither", movie: {}, want: "" },
  ];
  for (const c of cases) {
    assert.equal(formatYearRuntime({ ...base, ...c.movie }), c.want, c.name);
  }
});
