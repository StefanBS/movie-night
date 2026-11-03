import { requestJson } from "./http";

export type Movie = {
  tmdbId: number;
  title: string;
  releaseYear: number | null;
  posterUrl: string | null;
  // TMDB genre names in TMDB order; [] when unknown (search results, movies
  // cached before the backend stored them, or an older backend).
  genres: string[];
  // Running time in minutes; null when unknown. Formatting is the client's.
  runtimeMinutes: number | null;
};

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((g) => typeof g === "string");
}

// parseMovie validates an untrusted movie object (a search result or a night's
// attached movie) and returns a typed Movie, throwing on a bad shape.
export function parseMovie(raw: unknown): Movie {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("expected a movie object");
  }
  const { tmdbId, title, releaseYear, posterUrl, genres, runtimeMinutes } = raw as Record<
    string,
    unknown
  >;
  if (typeof tmdbId !== "number") {
    throw new Error("movie: tmdbId must be a number");
  }
  if (typeof title !== "string") {
    throw new Error("movie: title must be a string");
  }
  if (releaseYear !== undefined && releaseYear !== null && typeof releaseYear !== "number") {
    throw new Error("movie: releaseYear must be a number or null");
  }
  if (posterUrl !== undefined && posterUrl !== null && typeof posterUrl !== "string") {
    throw new Error("movie: posterUrl must be a string or null");
  }
  if (genres !== undefined && genres !== null && !isStringArray(genres)) {
    throw new Error("movie: genres must be an array of strings");
  }
  if (runtimeMinutes !== undefined && runtimeMinutes !== null && typeof runtimeMinutes !== "number") {
    throw new Error("movie: runtimeMinutes must be a number or null");
  }
  return {
    tmdbId,
    title,
    releaseYear: releaseYear ?? null,
    posterUrl: posterUrl ?? null,
    genres: genres ?? [],
    runtimeMinutes: runtimeMinutes ?? null,
  };
}

// parseMovies validates an untrusted search-results payload (an array) and
// returns typed Movies, throwing on a bad shape.
export function parseMovies(raw: unknown): Movie[] {
  if (!Array.isArray(raw)) {
    throw new Error("movies: expected an array");
  }
  return raw.map(parseMovie);
}

// searchMovies proxies TMDB search through the backend and returns typed results.
export function searchMovies(
  baseUrl: string,
  query: string,
  signal?: AbortSignal,
): Promise<Movie[]> {
  return requestJson(
    `${baseUrl}/movies/search?q=${encodeURIComponent(query)}`,
    parseMovies,
    { signal },
  );
}
