export type Pick = {
  id: string;
  groupId: string;
  pickerId: string;
  isCredited: boolean;
  scheduledFor: string;
  createdAt: string;
};

// parsePick validates an untrusted JSON payload (the 201 body from the backend)
// and returns a typed Pick, throwing a descriptive error if the shape is wrong.
export function parsePick(raw: unknown): Pick {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("expected a pick object");
  }
  const { id, groupId, pickerId, isCredited, scheduledFor, createdAt } =
    raw as Record<string, unknown>;
  if (typeof id !== "string") {
    throw new Error("pick: id must be a string");
  }
  if (typeof groupId !== "string") {
    throw new Error("pick: groupId must be a string");
  }
  if (typeof pickerId !== "string") {
    throw new Error("pick: pickerId must be a string");
  }
  if (typeof isCredited !== "boolean") {
    throw new Error("pick: isCredited must be a boolean");
  }
  if (typeof scheduledFor !== "string") {
    throw new Error("pick: scheduledFor must be a string");
  }
  if (typeof createdAt !== "string") {
    throw new Error("pick: createdAt must be a string");
  }
  return { id, groupId, pickerId, isCredited, scheduledFor, createdAt };
}

export type RecordPickInput = {
  pickerId: string;
  scheduledFor: string;
  isCredited?: boolean;
};

// recordPick records a pick via POST /groups/{groupId}/picks and returns the
// created Pick. The signal lets the caller cancel an in-flight request.
export async function recordPick(
  baseUrl: string,
  groupId: string,
  input: RecordPickInput,
  signal?: AbortSignal,
): Promise<Pick> {
  const res = await fetch(`${baseUrl}/groups/${groupId}/picks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  return parsePick(await res.json());
}
