import { parseTurn, type TurnMember } from "./turn";

export type Attendee = {
  id: string;
  name: string;
  role: "core" | "guest";
};

export type Night = {
  id: string;
  scheduledFor: string;
  pickerId: string | null;
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
  const { id, scheduledFor, pickerId, attendees } = raw as Record<string, unknown>;
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
  return { id, scheduledFor, pickerId: pickerId ?? null, attendees: attendees.map(parseAttendee) };
}

async function fetchNight(url: string, init?: RequestInit): Promise<Night> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  return parseNight(await res.json());
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

// getCurrentNight loads the group's latest night (open OR finalized) so the screen
// can resume and correct it across sessions, or null when there is none (the
// backend returns 404 in that case).
export async function getCurrentNight(
  baseUrl: string,
  groupId: string,
  signal?: AbortSignal,
): Promise<Night | null> {
  const res = await fetch(`${baseUrl}/groups/${groupId}/nights/current`, { signal });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  return parseNight(await res.json());
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
export async function getNightTurn(
  baseUrl: string,
  groupId: string,
  nightId: string,
  signal?: AbortSignal,
): Promise<TurnMember[]> {
  const res = await fetch(`${baseUrl}/groups/${groupId}/nights/${nightId}/turn`, { signal });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  return parseTurn(await res.json());
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
