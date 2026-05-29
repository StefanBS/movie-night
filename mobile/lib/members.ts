export type Member = {
  id: string;
  name: string;
  role: "core" | "guest";
};

function parseMember(raw: unknown, index: number): Member {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`member ${index}: expected an object`);
  }
  const { id, name, role } = raw as Record<string, unknown>;
  if (typeof id !== "string") {
    throw new Error(`member ${index}: id must be a string`);
  }
  if (typeof name !== "string") {
    throw new Error(`member ${index}: name must be a string`);
  }
  if (role !== "core" && role !== "guest") {
    throw new Error(`member ${index}: role must be "core" or "guest"`);
  }
  return { id, name, role };
}

// parseMembers validates an untrusted JSON payload and returns typed Members,
// throwing a descriptive error if the shape is wrong. This keeps the lie out
// of `await res.json()` — the boundary is checked, not just asserted.
export function parseMembers(raw: unknown): Member[] {
  if (!Array.isArray(raw)) {
    throw new Error("expected an array of members");
  }
  return raw.map(parseMember);
}

// fetchMembers loads a group's roster from the backend. The signal lets the
// caller cancel an in-flight request (e.g. when the screen unmounts).
export async function fetchMembers(
  baseUrl: string,
  groupId: string,
  signal?: AbortSignal,
): Promise<Member[]> {
  const res = await fetch(`${baseUrl}/groups/${groupId}/members`, { signal });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  return parseMembers(await res.json());
}
