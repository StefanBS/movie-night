import { errorMessage } from "./errors";
import { requestJson } from "./http";
import { createSessionCore, type Session } from "./session";

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

export type GroupSessionState = {
  // group is null until a load succeeds.
  group: Group | null;
  // error is the last load's failure, cleared by the next success.
  error: string | null;
};

export type GroupSession = Session<GroupSessionState> & {
  // load fetches the group unless it's already loaded or loading, so every
  // screen can call it on focus: the first call loads it, and after a failure
  // the next one retries.
  load(): Promise<void>;
  // set takes the group from a write's reply (a rename in Settings).
  set(group: Group): void;
};

// createGroupSession holds the app's one copy of the group (name + since
// date). The group only changes through a rename on this phone, so it is
// fetched once, not on every screen.
export function createGroupSession({ baseUrl, groupId }: { baseUrl: string; groupId: string }): GroupSession {
  const core = createSessionCore<GroupSessionState>({ group: null, error: null });
  let loading: Promise<void> | null = null;

  return {
    get state() {
      return core.state;
    },
    subscribe: core.subscribe,
    dispose: core.dispose,

    load() {
      if (core.state.group !== null) {
        return Promise.resolve();
      }
      loading ??= (async () => {
        try {
          const group = await core.track((signal) => fetchGroup(baseUrl, groupId, signal));
          core.set({ group: core.state.group ?? group, error: null });
        } catch (e) {
          core.set({ error: errorMessage(e, "failed to load the group") });
        } finally {
          loading = null;
        }
      })();
      return loading;
    },

    set(group) {
      core.set({ group, error: null });
    },
  };
}
