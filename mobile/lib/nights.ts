import { requestJson, requestJsonOrNull } from "./http";
import { parseMovie, type Movie } from "./movies";
import { parseTurn, type TurnMember } from "./turn";
import { daysUntil, todayLocalISO } from "./date";

export type Attendee = {
  id: string;
  name: string;
  role: "core" | "guest";
};

export type Night = {
  id: string;
  scheduledFor: string;
  pickerId: string | null;
  movie: Movie | null;
  attendees: Attendee[];
};

function parseAttendee(raw: unknown, index: number): Attendee {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`attendee ${index}: expected an object`);
  }
  const { id, name, role } = raw as Record<string, unknown>;
  if (typeof id !== "string") {
    throw new Error(`attendee ${index}: id must be a string`);
  }
  if (typeof name !== "string") {
    throw new Error(`attendee ${index}: name must be a string`);
  }
  if (role !== "core" && role !== "guest") {
    throw new Error(`attendee ${index}: role must be "core" or "guest"`);
  }
  return { id, name, role };
}

// parseNight validates an untrusted JSON payload and returns a typed Night,
// throwing a descriptive error if the shape is wrong.
export function parseNight(raw: unknown): Night {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("expected a night object");
  }
  const { id, scheduledFor, pickerId, movie, attendees } = raw as Record<string, unknown>;
  if (typeof id !== "string") {
    throw new Error("night: id must be a string");
  }
  if (typeof scheduledFor !== "string") {
    throw new Error("night: scheduledFor must be a string");
  }
  if (pickerId !== undefined && pickerId !== null && typeof pickerId !== "string") {
    throw new Error("night: pickerId must be a string or null");
  }
  if (!Array.isArray(attendees)) {
    throw new Error("night: attendees must be an array");
  }
  const parsedMovie = movie === undefined || movie === null ? null : parseMovie(movie);
  return {
    id,
    scheduledFor,
    pickerId: pickerId ?? null,
    movie: parsedMovie,
    attendees: attendees.map(parseAttendee),
  };
}

// parseNights validates an untrusted JSON array and returns typed Nights,
// throwing a descriptive error if the payload or any element is malformed.
export function parseNights(raw: unknown): Night[] {
  if (!Array.isArray(raw)) {
    throw new Error("expected an array of nights");
  }
  return raw.map(parseNight);
}

function fetchNight(url: string, init?: RequestInit): Promise<Night> {
  return requestJson(url, parseNight, init);
}

// createNight plans a night for scheduledFor (ISO YYYY-MM-DD) with an optional
// initial attendee list of user IDs.
export function createNight(
  baseUrl: string,
  groupId: string,
  scheduledFor: string,
  attendees: string[] = [],
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(`${baseUrl}/groups/${groupId}/nights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scheduledFor, attendees }),
    signal,
  });
}

export function getNight(
  baseUrl: string,
  groupId: string,
  nightId: string,
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(`${baseUrl}/groups/${groupId}/nights/${nightId}`, { signal });
}

// getNightOrNull loads a single night by id, or null when the backend has no
// such night (it returns 404 in that case) — so the detail screen can show an
// honest "not found" state instead of a generic error.
export function getNightOrNull(
  baseUrl: string,
  groupId: string,
  nightId: string,
  signal?: AbortSignal,
): Promise<Night | null> {
  return requestJsonOrNull(`${baseUrl}/groups/${groupId}/nights/${nightId}`, parseNight, { signal });
}

// getCurrentNight loads the group's latest night (open OR finalized) so the screen
// can resume and correct it across sessions, or null when there is none (the
// backend returns 404 in that case).
export function getCurrentNight(
  baseUrl: string,
  groupId: string,
  signal?: AbortSignal,
): Promise<Night | null> {
  return requestJsonOrNull(`${baseUrl}/groups/${groupId}/nights/current`, parseNight, { signal });
}

// listNights loads the group's picker-set nights, newest first — both recorded
// past nights (History) and future planned nights (the nextScheduledNight
// selector below). The backend filters out picker-less nights.
export function listNights(
  baseUrl: string,
  groupId: string,
  signal?: AbortSignal,
): Promise<Night[]> {
  return requestJson(`${baseUrl}/groups/${groupId}/nights`, parseNights, { signal });
}

export function addAttendee(
  baseUrl: string,
  groupId: string,
  nightId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(`${baseUrl}/groups/${groupId}/nights/${nightId}/attendees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
    signal,
  });
}

export function removeAttendee(
  baseUrl: string,
  groupId: string,
  nightId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(
    `${baseUrl}/groups/${groupId}/nights/${nightId}/attendees/${userId}`,
    { method: "DELETE", signal },
  );
}

// getNightTurn loads the core pick order for a night (element 0 is the picker).
export function getNightTurn(
  baseUrl: string,
  groupId: string,
  nightId: string,
  signal?: AbortSignal,
): Promise<TurnMember[]> {
  return requestJson(`${baseUrl}/groups/${groupId}/nights/${nightId}/turn`, parseTurn, { signal });
}

// recordNightPick sets (or corrects) the night's picker. The backend derives
// is_credited from the picker's role, so the client sends only the id.
export function recordNightPick(
  baseUrl: string,
  groupId: string,
  nightId: string,
  pickerId: string,
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(`${baseUrl}/groups/${groupId}/nights/${nightId}/pick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pickerId }),
    signal,
  });
}

// attachMovie sets (or changes) the night's movie. The client sends only the
// tmdbId; the backend re-fetches canonical metadata from TMDB.
export function attachMovie(
  baseUrl: string,
  groupId: string,
  nightId: string,
  tmdbId: number,
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(`${baseUrl}/groups/${groupId}/nights/${nightId}/movie`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tmdbId }),
    signal,
  });
}

// nextScheduledNight is the home's named selector: the soonest upcoming night,
// or null when none. "Upcoming" = strictly future (with or without a film yet —
// a film can be pre-picked for a scheduled night), or today while still
// film-less; today's night once a film is attached is recorded (done) and drops
// out. Fed by listNights; drives the "Up next" card, with the spotlight as the
// null fallback. ISO YYYY-MM-DD compares chronologically as text (like
// history.ts). `today` is injectable for deterministic tests (mirrors date.ts).
export function nextScheduledNight(
  nights: Night[],
  today: string = todayLocalISO(),
): Night | null {
  let soonest: Night | null = null;
  for (const n of nights) {
    const d = daysUntil(n.scheduledFor, today);
    if (d < 0) continue; // already past
    if (d === 0 && n.movie !== null) continue; // tonight, already recorded → done
    if (soonest === null || n.scheduledFor < soonest.scheduledFor) {
      soonest = n;
    }
  }
  return soonest;
}
