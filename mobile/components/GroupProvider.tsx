import { createContext, ReactNode, useCallback, useContext, useEffect } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";

import { API_URL } from "../apiUrl";
import { GROUP_ID } from "../lib/api";
import { createGroupSession, type GroupSession, type GroupSessionState } from "../lib/group";
import { useSession } from "./useSession";

type GroupContextValue = GroupSessionState & {
  // setGroup folds in a write's reply (Settings' rename).
  setGroup: GroupSession["set"];
};

const GroupContext = createContext<{ session: GroupSession; state: GroupSessionState } | null>(null);

// GroupProvider owns the app's one copy of the group (lib/group): it loads it
// at launch and refreshes it each time the app returns to the foreground, so a
// rename on another phone shows the next time this one opens the app.
// Settings' rename on this phone updates it in place.
export function GroupProvider({ children }: { children: ReactNode }) {
  const [session, state] = useSession(() => createGroupSession({ baseUrl: API_URL, groupId: GROUP_ID }));

  useEffect(() => {
    void session.load();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void session.refresh();
      }
    });
    return () => sub.remove();
  }, [session]);

  return <GroupContext.Provider value={{ session, state }}>{children}</GroupContext.Provider>;
}

// useGroup reads the group from a screen. If the launch load failed, focusing
// a screen that reads it retries (a no-op once the group is loaded).
export function useGroup(): GroupContextValue {
  const value = useContext(GroupContext);
  if (value === null) {
    throw new Error("useGroup must be used inside GroupProvider");
  }
  const { session, state } = value;
  useFocusEffect(
    useCallback(() => {
      void session.load();
    }, [session]),
  );
  return { ...state, setGroup: session.set };
}
