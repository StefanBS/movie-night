import { useCallback } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { EditNightScreen } from "../../../components/night/EditNightScreen";
import { NightLoadStatus } from "../../../components/night/NightLoadStatus";
import { useSession } from "../../../components/useSession";
import { API_URL } from "../../../apiUrl";
import { GROUP_ID } from "../../../lib/api";
import { todayLocalISO } from "../../../lib/date";
import { createNightLoad, nightLoadView } from "../../../lib/nightLoad";

export default function NightEditRoute() {
  // `from` names the screen that opened Edit night ("Tonight", "Night"), for
  // the back link.
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  return <NightEditLoader key={id} id={id} from={from ?? "Night"} />;
}

// NightEditLoader loads the Night on every focus (lib/nightLoad). Only the
// first load shows the spinner: the editor holds unsaved drafts, so a refocus
// refresh must not unmount it. The draft keeps the Night it opened with; a
// refresh only updates the calendar's dots.
function NightEditLoader({ id, from }: { id: string; from: string }) {
  const router = useRouter();
  const [load, state] = useSession(() =>
    createNightLoad({ baseUrl: API_URL, groupId: GROUP_ID, nightId: id, withNightDates: true }),
  );
  const { night, members, nightDates, error } = state;
  const today = todayLocalISO();
  const back = { label: from, onPress: () => router.back() };

  useFocusEffect(
    useCallback(() => {
      void load.load();
    }, [load]),
  );

  if (night === null) {
    return <NightLoadStatus title="Edit night" back={back} view={nightLoadView(state)} error={error} />;
  }

  return (
    <EditNightScreen
      key={night.id}
      night={night}
      members={members}
      today={today}
      nightDates={nightDates}
      back={back}
      onSaved={() => router.back()}
      onCancelled={() => router.replace("/")}
    />
  );
}
