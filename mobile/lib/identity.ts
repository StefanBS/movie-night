import { errorMessage } from "./errors";
import { requestJson, requestJsonOrNull, requestNoContent } from "./http";
import { fetchMembers, joinMember, type Member } from "./members";
import { createSessionCore, type Session } from "./session";

// The Identity module (GLOSSARY: Identity; ADR-0009). An install claims the
// person it acts as from the group's roster and keeps the bearer token the
// backend returns; GET /identity turns that token back into the person on every
// launch. Releasing deletes the token on both sides and starts over.

export type Identity = {
  id: string;
  name: string;
};

export type Claim = {
  token: string;
  identity: Identity;
};

// parseIdentity validates an untrusted identity payload.
export function parseIdentity(raw: unknown): Identity {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("identity: expected an object");
  }
  const { id, name } = raw as Record<string, unknown>;
  if (typeof id !== "string") {
    throw new Error("identity: id must be a string");
  }
  if (typeof name !== "string") {
    throw new Error("identity: name must be a string");
  }
  return { id, name };
}

// parseClaim validates the claim response: the token plus the identity.
export function parseClaim(raw: unknown): Claim {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("claim: expected an object");
  }
  const { token, identity } = raw as Record<string, unknown>;
  if (typeof token !== "string" || token === "") {
    throw new Error("claim: token must be a non-empty string");
  }
  return { token, identity: parseIdentity(identity) };
}

// claimIdentity claims a member of the group and returns the new token.
export function claimIdentity(
  baseUrl: string,
  groupId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<Claim> {
  return requestJson(`${baseUrl}/identity`, parseClaim, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupId, userId }),
    signal,
  });
}

// fetchIdentity resolves a token to its identity, or null when the backend no
// longer knows it (401: released, or never issued) — the install must claim
// again. Any other failure rejects, so being offline never drops the token.
export function fetchIdentity(
  baseUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<Identity | null> {
  return requestJsonOrNull(
    `${baseUrl}/identity`,
    parseIdentity,
    { headers: { Authorization: `Bearer ${token}` }, signal },
    401,
  );
}

// releaseIdentity revokes a token. Idempotent on the backend.
export function releaseIdentity(
  baseUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<void> {
  return requestNoContent(`${baseUrl}/identity`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
}

// TokenStorage is where the install keeps its token across launches (the
// device keychain in the app — see identityToken.ts).
export type TokenStorage = {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  remove(): Promise<void>;
};

// "loading" until the stored token is checked; "unclaimed" shows the roster to
// claim from; "failed" means the check itself failed (e.g. offline) and load()
// retries it.
export type IdentityStatus = "loading" | "unclaimed" | "claimed" | "failed";

export type IdentitySessionState = {
  status: IdentityStatus;
  identity: Identity | null;
  error: string | null;
  // The active members an unclaimed install can claim, core first.
  members: Member[];
  busy: boolean;
  actionError: string | null;
};

export type IdentitySession = Session<IdentitySessionState> & {
  // load checks the stored token, and loads the roster when there is none.
  load(): Promise<void>;
  // claim makes userId this install's identity.
  claim(userId: string): Promise<void>;
  // joinAndClaim adds a new person as a guest, then claims them.
  joinAndClaim(name: string): Promise<void>;
  // release gives the identity up and returns to the roster.
  release(): Promise<void>;
};

export function createIdentitySession({
  baseUrl,
  groupId,
  storage,
}: {
  baseUrl: string;
  groupId: string;
  storage: TokenStorage;
}): IdentitySession {
  const core = createSessionCore<IdentitySessionState>({
    status: "loading",
    identity: null,
    error: null,
    members: [],
    busy: false,
    actionError: null,
  });

  const showRoster = async () => {
    const members = await core.track((signal) => fetchMembers(baseUrl, groupId, signal));
    core.set({
      status: "unclaimed",
      identity: null,
      error: null,
      members: members.filter((m) => m.status === "active"),
    });
  };

  const load = async () => {
    core.set({ status: "loading", error: null });
    try {
      const token = await storage.get();
      if (token !== null) {
        const identity = await core.track((signal) => fetchIdentity(baseUrl, token, signal));
        if (identity !== null) {
          core.set({ status: "claimed", identity });
          return;
        }
        await storage.remove(); // the backend no longer knows it
      }
      await showRoster();
    } catch (e) {
      core.set({ status: "failed", error: errorMessage(e, "couldn't check who you are") });
    }
  };

  // act runs one user action with the busy flag and its error, so a double tap
  // can't claim twice.
  const act = async (fallback: string, run: () => Promise<void>) => {
    if (core.state.busy) {
      return;
    }
    core.set({ busy: true, actionError: null });
    try {
      await run();
      core.set({ busy: false });
    } catch (e) {
      core.set({ busy: false, actionError: errorMessage(e, fallback) });
    }
  };

  const claimMember = async (userId: string) => {
    const claim = await core.track((signal) => claimIdentity(baseUrl, groupId, userId, signal));
    await storage.set(claim.token);
    core.set({ status: "claimed", identity: claim.identity, members: [] });
  };

  return {
    get state() {
      return core.state;
    },
    subscribe: core.subscribe,
    dispose: core.dispose,
    load,
    claim: (userId) => act("couldn't claim that person", () => claimMember(userId)),
    joinAndClaim: (name) =>
      act("couldn't add you", async () => {
        const member = await core.track((signal) => joinMember(baseUrl, groupId, name, "guest", signal));
        await claimMember(member.id);
      }),
    release: () =>
      act("couldn't switch", async () => {
        const token = await storage.get();
        if (token !== null) {
          await core.track((signal) => releaseIdentity(baseUrl, token, signal));
          await storage.remove();
        }
        await showRoster();
      }),
  };
}
