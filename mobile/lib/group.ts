import { requestJson } from "./http";

export type Group = {
  name: string;
  createdOn: string;
};

// parseGroup validates an untrusted JSON payload and returns a typed Group,
// throwing a descriptive error if the shape is wrong — the same boundary check
// as parseMembers, so `await res.json()` isn't trusted blindly. createdOn is the
// group's creation date (YYYY-MM-DD); the Settings screen labels it "since".
export function parseGroup(raw: unknown): Group {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("group: expected an object");
  }
  const { name, createdOn } = raw as Record<string, unknown>;
  if (typeof name !== "string") {
    throw new Error("group: name must be a string");
  }
  if (typeof createdOn !== "string") {
    throw new Error("group: createdOn must be a string");
  }
  return { name, createdOn };
}

// fetchGroup loads a group's name + since date. The signal lets the caller
// cancel an in-flight request.
export function fetchGroup(
  baseUrl: string,
  groupId: string,
  signal?: AbortSignal,
): Promise<Group> {
  return requestJson(`${baseUrl}/groups/${groupId}`, parseGroup, { signal });
}

// fetchGroupName loads just the group's name, for screens where it's a nicety
// (a calendar entry's title): any failure resolves null instead of failing the
// screen's load.
export function fetchGroupName(baseUrl: string, groupId: string, signal?: AbortSignal): Promise<string | null> {
  return fetchGroup(baseUrl, groupId, signal).then(
    (g) => g.name,
    () => null,
  );
}

// renameGroup PATCHes a new group name and returns the updated group.
export function renameGroup(
  baseUrl: string,
  groupId: string,
  name: string,
  signal?: AbortSignal,
): Promise<Group> {
  return requestJson(`${baseUrl}/groups/${groupId}`, parseGroup, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
    signal,
  });
}
