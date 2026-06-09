import { parseTurn, type TurnMember } from "./turn";

export type Attendee = {
  id: string;
  name: string;
  role: "core" | "guest";
};

export type Night = {
  id: string;
  scheduledFor: string;
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
  const { id, scheduledFor, attendees } = raw as Record<string, unknown>;
  if (typeof id !== "string") {
    throw new Error("night: id must be a string");
  }
  if (typeof scheduledFor !== "string") {
    throw new Error("night: scheduledFor must be a string");
  }
  if (!Array.isArray(attendees)) {
    throw new Error("night: attendees must be an array");
  }
  return { id, scheduledFor, attendees: attendees.map(parseAttendee) };
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
