export type Member = {
  id: string;
  name: string;
  role: "core" | "guest";
  status: "active" | "inactive";
};

function parseMember(raw: unknown, index = 0): Member {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`member ${index}: expected an object`);
  }
  const { id, name, role, status } = raw as Record<string, unknown>;
  if (typeof id !== "string") {
    throw new Error(`member ${index}: id must be a string`);
  }
  if (typeof name !== "string") {
    throw new Error(`member ${index}: name must be a string`);
  }
  if (role !== "core" && role !== "guest") {
    throw new Error(`member ${index}: role must be "core" or "guest"`);
  }
  if (status !== "active" && status !== "inactive") {
    throw new Error(`member ${index}: status must be "active" or "inactive"`);
  }
  return { id, name, role, status };
}

// parseMembers validates an untrusted JSON payload and returns typed Members,
// throwing a descriptive error if the shape is wrong. This keeps the lie out
// of `await res.json()` — the boundary is checked, not just asserted.
export function parseMembers(raw: unknown): Member[] {
  if (!Array.isArray(raw)) {
    throw new Error("expected an array of members");
  }
  return raw.map((m, i) => parseMember(m, i));
}

// fetchMembers loads a group's full roster (active + inactive, core + guest)
// from the backend. The signal lets the caller cancel an in-flight request.
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

// postMember POSTs to a membership endpoint and returns the resulting member.
// An undefined body sends no payload (the transition endpoints take none).
async function postMember(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Member> {
  const res = await fetch(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  return parseMember(await res.json());
}

// addMember adds a new core member by name (join). Returns the created Member.
export function addMember(
  baseUrl: string,
  groupId: string,
  name: string,
  signal?: AbortSignal,
): Promise<Member> {
  return postMember(`${baseUrl}/groups/${groupId}/members`, { name }, signal);
}

// deactivateMember removes a member from the rotation (leave).
export function deactivateMember(
  baseUrl: string,
  groupId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<Member> {
  return postMember(
    `${baseUrl}/groups/${groupId}/members/${userId}/deactivate`,
    undefined,
    signal,
  );
}

// reactivateMember returns a deactivated member to the rotation (return).
export function reactivateMember(
  baseUrl: string,
  groupId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<Member> {
  return postMember(
    `${baseUrl}/groups/${groupId}/members/${userId}/reactivate`,
    undefined,
    signal,
  );
}

// promoteMember promotes a guest into the core rotation (promote).
export function promoteMember(
  baseUrl: string,
  groupId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<Member> {
  return postMember(
    `${baseUrl}/groups/${groupId}/members/${userId}/promote`,
    undefined,
    signal,
  );
}
