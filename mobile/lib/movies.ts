import { requestJson } from "./http";

export type Movie = {
  tmdbId: number;
  title: string;
  releaseYear: number | null;
  posterUrl: string | null;
  // TMDB genre names in TMDB order; [] when unknown (e.g. search results).
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
  if (releaseYear !== null && typeof releaseYear !== "number") {
    throw new Error("movie: releaseYear must be a number or null");
  }
  if (posterUrl !== null && typeof posterUrl !== "string") {
    throw new Error("movie: posterUrl must be a string or null");
  }
  if (!isStringArray(genres)) {
    throw new Error("movie: genres must be an array of strings");
  }
  if (runtimeMinutes !== null && typeof runtimeMinutes !== "number") {
    throw new Error("movie: runtimeMinutes must be a number or null");
  }
  return { tmdbId, title, releaseYear, posterUrl, genres, runtimeMinutes };
}

// A SearchResult is a film search hit: the film, plus watchedOn, the date
// (YYYY-MM-DD) the group last watched it, or null.
export type SearchResult = Movie & { watchedOn: string | null };

// parseSearchResults validates an untrusted search-results payload (an array)
// and returns typed results, throwing on a bad shape.
export function parseSearchResults(raw: unknown): SearchResult[] {
  if (!Array.isArray(raw)) {
    throw new Error("movies: expected an array");
  }
  return raw.map((r: unknown) => {
    const movie = parseMovie(r);
    const { watchedOn } = r as Record<string, unknown>;
    if (watchedOn !== null && typeof watchedOn !== "string") {
      throw new Error("movie: watchedOn must be a string or null");
    }
    return { ...movie, watchedOn };
  });
}

// searchMovies proxies TMDB search through the backend for a group's Night,
// so each result says when the group last watched it; the Night's own film
// doesn't count.
export function searchMovies(
  baseUrl: string,
  groupId: string,
  nightId: string,
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, exceptNight: nightId });
  return requestJson(`${baseUrl}/groups/${groupId}/movies/search?${params}`, parseSearchResults, { signal });
}

// formatRuntime renders a running time in minutes as "1h 38m", "45m" or "2h".
export function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export type MovieDetail = { kind: "year" | "genres" | "runtime"; text: string };

// movieDetails returns the detail lines shown under a film's title, in order:
// year, comma-separated genres, runtime. A line we don't have is left out
// (never a placeholder); TMDB's 0 runtime means unknown. `kind` lets the
// screen set figures tabular on the numeric lines only.
export function movieDetails(movie: Movie): MovieDetail[] {
  const lines: MovieDetail[] = [];
  if (movie.releaseYear !== null) {
    lines.push({ kind: "year", text: String(movie.releaseYear) });
  }
  const genres = movie.genres.filter((g) => g !== "").join(", ");
  if (genres !== "") {
    lines.push({ kind: "genres", text: genres });
  }
  if (movie.runtimeMinutes !== null && movie.runtimeMinutes > 0) {
    lines.push({ kind: "runtime", text: formatRuntime(movie.runtimeMinutes) });
  }
  return lines;
}

// formatYearRuntime is the "2023 · 1h 46m" line under a recorded film: its
// year and runtime lines from movieDetails, joined, with any we don't have
// left out ("" when neither is known).
export function formatYearRuntime(movie: Movie): string {
  return movieDetails(movie)
    .filter((d) => d.kind !== "genres")
    .map((d) => d.text)
    .join(" · ");
}
