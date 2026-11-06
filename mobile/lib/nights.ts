import { requestJson, requestJsonOrNull, requestNoContent } from "./http";
import type { Member } from "./members";
import { parseMovie, type Movie } from "./movies";
import { parseReminders, type Reminders } from "./reminders";
import { parseRepeat, type Repeat } from "./repeat";
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
  // watchedAt is when the group recorded the Night as watched (an ISO
  // timestamp), or null until then (ADR-0012).
  watchedAt: string | null;
  // repeat is the Night's series rule, or null for a one-off (ADR-0014).
  repeat: Repeat | null;
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

// nightPicker is the Night's picker among its attendees, or null if the
// payload somehow lacks them (every Night has one, ADR-0008).
export function nightPicker(night: Night): Attendee | null {
  return night.attendees.find((a) => a.id === night.pickerId) ?? null;
}

// nightPickerName is the picker's full name: from the Night's attendees, else
// from the group's members, else "" when neither has them.
export function nightPickerName(night: Night, members: Pick<Member, "id" | "name">[]): string {
  return nightPicker(night)?.name ?? members.find((m) => m.id === night.pickerId)?.name ?? "";
}

// parseNight validates an untrusted JSON payload and returns a typed Night,
// throwing a descriptive error if the shape is wrong.
export function parseNight(raw: unknown): Night {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("expected a night object");
  }
  const { id, scheduledFor, startTime, pickerId, movie, attendees, reminders, watchedAt, repeat } = raw as Record<string, unknown>;
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
  if (watchedAt !== undefined && watchedAt !== null && typeof watchedAt !== "string") {
    throw new Error("night: watchedAt must be a string or null");
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
    watchedAt: watchedAt ?? null,
    repeat: parseRepeat(repeat),
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
// night's own pick — the order its picker is chosen from. `present` ranks a
// draft of who came instead of the stored attendees; an empty draft is []
// without a request (a blank `present` would mean the stored ones).
export async function getNightTurn(
  baseUrl: string,
  groupId: string,
  nightId: string,
  signal?: AbortSignal,
  present?: string[],
): Promise<TurnMember[]> {
  let url = `${baseUrl}/groups/${groupId}/nights/${nightId}/turn`;
  if (present !== undefined) {
    if (present.length === 0) {
      return [];
    }
    url += `?present=${encodeURIComponent(present.join(","))}`;
  }
  return requestJson(url, parseTurn, { signal });
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
// whole attendee set (which must still include the picker), its reminder
// settings and its repeat (null ends the series).
export type NightChanges = {
  scheduledFor: string;
  startTime: string | null;
  attendees: string[];
  reminders: Reminders;
  repeat: Repeat | null;
};

// updateNight saves a Night's date, start time, attendees, reminders and repeat in one request that either
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

// Attendance is who came to a Night and who picked, as the "We watched it"
// flow confirms them. The picker must be one of the attendees.
export type Attendance = {
  attendees: string[];
  pickerId: string;
};

// recordWatched records a Night as watched (ADR-0012) with the attendees and
// picker the group confirmed, in the one PATCH that either fully applies or
// changes nothing. Its date, start time, reminders and repeat are sent as they
// are, so a repeating Night opens the next one in its series (ADR-0014). The
// backend rejects a Night with no film (422); recording again keeps the first
// watchedAt.
export function recordWatched(
  baseUrl: string,
  groupId: string,
  night: Night,
  { attendees, pickerId }: Attendance,
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(`${baseUrl}/groups/${groupId}/nights/${night.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...savedChanges(night), attendees, pickerId, watched: true }),
    signal,
  });
}

// changeNightPicker changes a saved Night's picker (who must be attending) in
// the whole-Night PATCH, sending everything else as it is. The backend derives
// whether the pick is credited from the picker's role, so a guest's pick never
// moves standings.
export function changeNightPicker(
  baseUrl: string,
  groupId: string,
  night: Night,
  pickerId: string,
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(`${baseUrl}/groups/${groupId}/nights/${night.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...savedChanges(night), pickerId }),
    signal,
  });
}

// savedChanges is a saved Night's editable fields as they stand, the base of a
// PATCH that changes only who came, who picked or whether it was watched.
function savedChanges(night: Night): NightChanges {
  return {
    scheduledFor: night.scheduledFor,
    startTime: night.startTime,
    attendees: night.attendees.map((a) => a.id),
    reminders: night.reminders,
    repeat: night.repeat,
  };
}
