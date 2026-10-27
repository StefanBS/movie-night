import { createContext, ReactNode, useContext, useEffect } from "react";

import { API_URL } from "../apiUrl";
import { identityToken } from "../identityToken";
import { pushDevice } from "../pushDevice";
import { GROUP_ID } from "../lib/api";
import { createIdentitySession, type IdentitySession, type IdentitySessionState } from "../lib/identity";
import { ClaimIdentityScreen } from "./ClaimIdentityScreen";
import { useSession } from "./useSession";

type IdentityContextValue = {
  session: IdentitySession;
  state: IdentitySessionState;
};

const IdentityContext = createContext<IdentityContextValue | null>(null);

// IdentityProvider owns the app's one identity session (lib/identity, ADR-0009)
// and gates the app on it: until this install has claimed who it is, it shows
// the claim screen in place of `children`.
export function IdentityProvider({ children }: { children: ReactNode }) {
  const [session, state] = useSession(() =>
    createIdentitySession({ baseUrl: API_URL, groupId: GROUP_ID, storage: identityToken, push: pushDevice }),
  );

  useEffect(() => {
    void session.load();
  }, [session]);

  return (
    <IdentityContext.Provider value={{ session, state }}>
      {state.status === "claimed" ? children : <ClaimIdentityScreen session={session} state={state} />}
    </IdentityContext.Provider>
  );
}

// useIdentity reads the identity session from inside the claimed app.
export function useIdentity(): IdentityContextValue {
  const value = useContext(IdentityContext);
  if (value === null) {
    throw new Error("useIdentity must be used inside IdentityProvider");
  }
  return value;
}
