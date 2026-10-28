import { requestJson, requestJsonOrNull, requestNoContent } from "./http";
import { parseMovie, type Movie } from "./movies";
import { parseReminders, type Reminders } from "./reminders";
import { parseTurn, type TurnMember } from "./turn";

export type Attendee = {
  id: string;
  name: string;
  role: "core" | "guest";
};

// Night is one dated movie night. Every Night has a picker, who is always one
// of its attendees (ADR-0008); its date-relative state lives in nightLifecycle.
// startTime is an optional zone-less HH:MM, read on this phone's clock
// (ADR-0011).
export type Night = {
  id: string;
  scheduledFor: string;
  startTime: string | null;
  pickerId: string;
  movie: Movie | null;
  attendees: Attendee[];
  reminders: Reminders;
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

const START_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// parseNight validates an untrusted JSON payload and returns a typed Night,
// throwing a descriptive error if the shape is wrong.
export function parseNight(raw: unknown): Night {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("expected a night object");
  }
  const { id, scheduledFor, startTime, pickerId, movie, attendees, reminders } = raw as Record<string, unknown>;
  if (typeof id !== "string") {
    throw new Error("night: id must be a string");
  }
  if (typeof scheduledFor !== "string") {
    throw new Error("night: scheduledFor must be a string");
  }
  if (startTime !== undefined && startTime !== null && (typeof startTime !== "string" || !START_TIME.test(startTime))) {
    throw new Error("night: startTime must be HH:MM or null");
  }
  if (typeof pickerId !== "string") {
    throw new Error("night: pickerId must be a string");
  }
  if (!Array.isArray(attendees)) {
    throw new Error("night: attendees must be an array");
  }
  const parsedMovie = movie === undefined || movie === null ? null : parseMovie(movie);
  return {
    id,
    scheduledFor,
    startTime: startTime ?? null,
    pickerId,
    movie: parsedMovie,
    attendees: attendees.map(parseAttendee),
    reminders: parseReminders(reminders),
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

// NewNight is everything a Night is created with (ADR-0008): its date (ISO
// YYYY-MM-DD), its optional HH:MM start time, who's attending, and the picker,
// who must be one of them.
export type NewNight = {
  scheduledFor: string;
  startTime: string | null;
  attendees: string[];
  pickerId: string;
};

// createNight creates a whole Night in one request. The backend rejects a
// picker who isn't attending (422) and a date that already has a Night (409).
export function createNight(
  baseUrl: string,
  groupId: string,
  night: NewNight,
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(`${baseUrl}/groups/${groupId}/nights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(night),
    signal,
  });
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

// listNights loads every Night of the group, past and upcoming, newest first.
// The nightLifecycle selectors split it for Up next, History and the calendar.
// A failure fails the screen only where the list is what the screen is for
// (History). Elsewhere it is a hint — Home's planned card, the calendar dots —
// so callers degrade to an empty list and let their main fetch own the error.
export function listNights(
  baseUrl: string,
  groupId: string,
  signal?: AbortSignal,
): Promise<Night[]> {
  return requestJson(`${baseUrl}/groups/${groupId}/nights`, parseNights, { signal });
}

// getNightTurn loads the core pick order over a night's attendees, ignoring the
// night's own pick — the order its picker is chosen from.
export function getNightTurn(
  baseUrl: string,
  groupId: string,
  nightId: string,
  signal?: AbortSignal,
): Promise<TurnMember[]> {
  return requestJson(`${baseUrl}/groups/${groupId}/nights/${nightId}/turn`, parseTurn, { signal });
}

// recordNightPick changes the night's picker (who must be attending). The backend derives
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

export function detachMovie(
  baseUrl: string,
  groupId: string,
  nightId: string,
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(`${baseUrl}/groups/${groupId}/nights/${nightId}/movie`, {
    method: "DELETE",
    signal,
  });
}

// NightChanges is a saved Night's date and start time (null clears it), its
// whole attendee set (which must still include the picker) and its reminder
// settings.
export type NightChanges = {
  scheduledFor: string;
  startTime: string | null;
  attendees: string[];
  reminders: Reminders;
};

// updateNight saves a Night's date, start time, attendees and reminders in one request that either
// fully applies or changes nothing. The backend rejects dropping the picker or
// a non-member (422) and a date that already has a Night (409).
export function updateNight(
  baseUrl: string,
  groupId: string,
  nightId: string,
  changes: NightChanges,
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(`${baseUrl}/groups/${groupId}/nights/${nightId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
    signal,
  });
}

export function deleteNight(
  baseUrl: string,
  groupId: string,
  nightId: string,
  signal?: AbortSignal,
): Promise<void> {
  return requestNoContent(`${baseUrl}/groups/${groupId}/nights/${nightId}`, {
    method: "DELETE",
    signal,
  });
}
