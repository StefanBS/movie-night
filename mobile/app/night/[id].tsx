import { useCallback } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { ExistingNightEditor } from "../../components/night/ExistingNightEditor";
import { NightLoadStatus } from "../../components/night/NightLoadStatus";
import { useSession } from "../../components/useSession";
import { API_URL } from "../../apiUrl";
import { GROUP_ID } from "../../lib/api";
import { todayLocalISO } from "../../lib/date";
import { createNightLoad, nightLoadView } from "../../lib/nightLoad";

export default function NightDetailRoute() {
  // `from` names the screen that opened the night, for the back link.
  // `step=pick` opens it on the film search (the Done screen's Change film).
  const { id, from, step } = useLocalSearchParams<{ id: string; from?: string; step?: string }>();
  return <NightDetailLoader key={id} id={id} from={from ?? "Tonight"} pick={step === "pick"} />;
}

// NightDetailLoader loads the Night on every focus (lib/nightLoad). Only the
// first load shows the spinner, so returning from the Edit screen refreshes the
// Night under a still-mounted editor instead of resetting its step and search.
function NightDetailLoader({ id, from, pick }: { id: string; from: string; pick: boolean }) {
  const router = useRouter();
  const [load, state] = useSession(() =>
    createNightLoad({ baseUrl: API_URL, groupId: GROUP_ID, nightId: id }),
  );
  const { night, groupName, error, loadStartedAt } = state;
  const today = todayLocalISO();

  useFocusEffect(
    useCallback(() => {
      void load.load();
    }, [load]),
  );

  if (night === null) {
    return <NightLoadStatus title="Night" back={{ label: from, onPress: () => router.back() }} view={nightLoadView(state)} error={error} />;
  }

  return (
    <ExistingNightEditor
      key={night.id}
      night={night}
      groupName={groupName}
      loadStartedAt={loadStartedAt}
      today={today}
      initialStep={pick ? "pick" : undefined}
      back={{ label: from, onPress: () => router.back() }}
      onEdit={() =>
        router.push({ pathname: "/night/edit/[id]", params: { id: night.id, from: "Night" } })
      }
    />
  );
}
