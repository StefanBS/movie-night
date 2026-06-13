export type Movie = {
  tmdbId: number;
  title: string;
  releaseYear: number | null;
};

// movieLabel renders a movie as "Title (Year)", or just the title when the
// release year is unknown.
export function movieLabel(m: Movie): string {
  return m.releaseYear !== null ? `${m.title} (${m.releaseYear})` : m.title;
}

// parseMovie validates an untrusted movie object (a search result or a night's
// attached movie) and returns a typed Movie, throwing on a bad shape.
export function parseMovie(raw: unknown): Movie {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("expected a movie object");
  }
  const { tmdbId, title, releaseYear } = raw as Record<string, unknown>;
  if (typeof tmdbId !== "number") {
    throw new Error("movie: tmdbId must be a number");
  }
  if (typeof title !== "string") {
    throw new Error("movie: title must be a string");
  }
  if (releaseYear !== undefined && releaseYear !== null && typeof releaseYear !== "number") {
    throw new Error("movie: releaseYear must be a number or null");
  }
  return { tmdbId, title, releaseYear: releaseYear ?? null };
}

// searchMovies proxies TMDB search through the backend and returns typed results.
export async function searchMovies(
  baseUrl: string,
  query: string,
  signal?: AbortSignal,
): Promise<Movie[]> {
  const res = await fetch(`${baseUrl}/movies/search?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("movies: expected an array");
  }
  return data.map(parseMovie);
}
