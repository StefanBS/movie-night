import { requestJson } from "./http";

export type Member = {
  id: string;
  name: string;
  role: "core" | "guest";
  status: "active" | "inactive";
  joinedOn: string;
};

function parseMember(raw: unknown, index = 0): Member {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`member ${index}: expected an object`);
  }
  const { id, name, role, status, joinedOn } = raw as Record<string, unknown>;
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
  if (typeof joinedOn !== "string") {
    throw new Error(`member ${index}: joinedOn must be a string`);
  }
  return { id, name, role, status, joinedOn };
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
export function fetchMembers(
  baseUrl: string,
  groupId: string,
  signal?: AbortSignal,
): Promise<Member[]> {
  return requestJson(`${baseUrl}/groups/${groupId}/members`, parseMembers, { signal });
}

// postMember POSTs to a membership endpoint and returns the resulting member.
// An undefined body sends no payload (the transition endpoints take none).
function postMember(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Member> {
  return requestJson(url, (raw) => parseMember(raw), {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
}

// joinMember adds a new member by name with the given role (core enters the
// rotation; guest watches but never picks). Returns the created Member.
export function joinMember(
  baseUrl: string,
  groupId: string,
  name: string,
  role: "core" | "guest",
  signal?: AbortSignal,
): Promise<Member> {
  return postMember(`${baseUrl}/groups/${groupId}/members`, { name, role }, signal);
}

// A churn transition a member can undergo: leave (deactivate), return
// (reactivate), or a guest joining the core rotation (promote). The value
// doubles as the backend endpoint verb.
export type MemberAction = "deactivate" | "reactivate" | "promote";

// transitionMember applies a churn transition by POSTing to its (body-less)
// endpoint and returns the resulting member.
export function transitionMember(
  baseUrl: string,
  groupId: string,
  userId: string,
  action: MemberAction,
  signal?: AbortSignal,
): Promise<Member> {
  return postMember(
    `${baseUrl}/groups/${groupId}/members/${userId}/${action}`,
    undefined,
    signal,
  );
}

// memberActions returns the churn transitions valid for a member's current
// state. The rules live here (pure, testable) rather than in the screen.
export function memberActions(m: Member): MemberAction[] {
  if (m.status === "inactive") {
    return ["reactivate"];
  }
  if (m.role === "guest") {
    return ["promote", "deactivate"];
  }
  return ["deactivate"];
}
