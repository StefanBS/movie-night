import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { TopBar } from "../../../components";
import { NightLoadStatus, RecordedView, WhoStep } from "../../../components/night";
import { useHardwareBack } from "../../../components/useHardwareBack";
import { useSession } from "../../../components/useSession";
import { API_URL } from "../../../apiUrl";
import { GROUP_ID } from "../../../lib/api";
import { todayLocalISO } from "../../../lib/date";
import type { Member } from "../../../lib/members";
import { createNightWatched } from "../../../lib/nightWatched";
import { createThemedStyles, space, textPresets } from "../../../theme";

const TITLE = "We watched it";

export default function NightWatchedRoute() {
  // `from` names the screen that opened the flow ("Tonight"), for People's
  // back link.
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  return <NightWatchedFlow key={id} id={id} from={from ?? "Tonight"} />;
}

// NightWatchedFlow renders the "We watched it" module (lib/nightWatched):
// People, pre-filled with who was coming, then Done. People's footer records
// the Night, so Done is the receipt; a failed record keeps People and its
// selection. It loads once, not on every focus: People holds a draft.
function NightWatchedFlow({ id, from }: { id: string; from: string }) {
  const styles = useStyles();
  const router = useRouter();
  const [today] = useState(todayLocalISO);
  const [flow, state] = useSession(() =>
    createNightWatched({ baseUrl: API_URL, groupId: GROUP_ID, nightId: id }),
  );
  // Done returns to People, on Android's back button too; People leaves.
  useHardwareBack(state.step === "done" ? flow.back : null);
  const back = { label: from, onPress: () => router.back() };

  useEffect(() => {
    void flow.load();
  }, [flow]);

  const { night } = state;

  if (state.loading || state.error !== null || night === null) {
    const view = state.loading ? "loading" : state.error !== null ? "failed" : "missing";
    return <NightLoadStatus title={TITLE} back={back} view={view} error={state.error} />;
  }

  if (state.step === "done") {
    return (
      <View style={styles.screen}>
        <TopBar kind="title" title={TITLE} />
        <RecordedView
          night={night}
          onDone={() => router.back()}
          onChangeFilm={() =>
            router.replace({ pathname: "/night/[id]", params: { id: night.id, from, step: "pick" } })
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TopBar kind="title" title={TITLE} back={back} />
      {state.actionError !== null ? (
        <Text style={[styles.banner, styles.error]}>{state.actionError}</Text>
      ) : null}
      <WhoStep
        scheduledFor={night.scheduledFor}
        today={today}
        members={state.members}
        attendeeIds={state.attendeeIds}
        pickerId={state.pickerId}
        busy={state.busy}
        stepper={false}
        nextLabel={(first) => `Record: ${first} picked →`}
        onToggle={(m: Member) => flow.toggle(m.id)}
        onChoosePicker={flow.choosePicker}
        onNext={() => void flow.record()}
      />
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  error: { ...textPresets.body, color: colors.text.danger },
  banner: { paddingVertical: space[2], paddingHorizontal: space[5], textAlign: "center" },
}));
