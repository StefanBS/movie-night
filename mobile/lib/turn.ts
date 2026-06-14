import { requestJson } from "./http";

export type TurnMember = {
  id: string;
  name: string;
  role: "core" | "guest";
  servedCount: number;
  lastPickedOn: string | null;
};

function parseTurnMember(raw: unknown, index: number): TurnMember {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`member ${index}: expected an object`);
  }
  const { id, name, role, servedCount, lastPickedOn } = raw as Record<
    string,
    unknown
  >;
  if (typeof id !== "string") {
    throw new Error(`member ${index}: id must be a string`);
  }
  if (typeof name !== "string") {
    throw new Error(`member ${index}: name must be a string`);
  }
  if (role !== "core" && role !== "guest") {
    throw new Error(`member ${index}: role must be "core" or "guest"`);
  }
  if (typeof servedCount !== "number") {
    throw new Error(`member ${index}: servedCount must be a number`);
  }
  if (lastPickedOn !== null && typeof lastPickedOn !== "string") {
    throw new Error(`member ${index}: lastPickedOn must be a string or null`);
  }
  return { id, name, role, servedCount, lastPickedOn };
}

// parseTurn validates an untrusted JSON payload and returns typed TurnMembers,
// throwing a descriptive error if the shape is wrong. Element 0 is the picker.
export function parseTurn(raw: unknown): TurnMember[] {
  if (!Array.isArray(raw)) {
    throw new Error("expected an array of members");
  }
  return raw.map(parseTurnMember);
}

// fetchTurn loads a group's turn ranking from the backend. The optional signal
// lets the caller cancel an in-flight request (e.g. on unmount).
export function fetchTurn(
  baseUrl: string,
  groupId: string,
  signal?: AbortSignal,
): Promise<TurnMember[]> {
  return requestJson(`${baseUrl}/groups/${groupId}/turn`, parseTurn, { signal });
}
