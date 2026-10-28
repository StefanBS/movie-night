import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { TopBar } from "../../components";
import { WhenStep, WhoStep, ExistingNightEditor } from "../../components/night";
import { useSession } from "../../components/useSession";
import { API_URL } from "../../apiUrl";
import { GROUP_ID } from "../../lib/api";
import { todayLocalISO } from "../../lib/date";
import type { Member } from "../../lib/members";
import { createNightPlan } from "../../lib/nightPlan";
import type { Night } from "../../lib/nights";
import {
  colors,
  textPresets,
  space,
} from "../../theme";

// NightScreen renders the Plan module (lib/nightPlan) — When, then Who — and,
// once the Plan is saved as a Night, hands that Night to the editor on its
// film step. Nothing is saved before "Next", so backing out leaves nothing.
export default function NightScreen() {
  const router = useRouter();
  const [today] = useState(todayLocalISO);
  const [plan, state] = useSession(() =>
    createNightPlan({ baseUrl: API_URL, groupId: GROUP_ID, today }),
  );
  const [created, setCreated] = useState<Night | null>(null);

  useEffect(() => {
    void plan.load();
  }, [plan]);

  const onCreate = async () => {
    const night = await plan.create();
    if (night !== null) {
      setCreated(night);
    }
  };

  if (state.loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator style={styles.center} size="large" color={colors.accent.base} />
      </View>
    );
  }
  if (state.error !== null) {
    return (
      <View style={styles.screen}>
        <Text style={[styles.center, styles.error]}>{`Couldn't load the club: ${state.error}`}</Text>
      </View>
    );
  }

  if (created !== null) {
    return (
      <ExistingNightEditor
        key={created.id}
        night={created}
        members={state.members}
        today={today}
        initialStep="pick"
        onDone={() => router.back()}
        onCancel={() => router.back()}
        onEdit={() =>
          router.push({ pathname: "/night/edit/[id]", params: { id: created.id } })
        }
      />
    );
  }

  const banner =
    state.actionError !== null ? (
      <Text style={[styles.banner, styles.error]}>{state.actionError}</Text>
    ) : null;

  if (state.step === "who") {
    return (
      <View style={styles.screen}>
        <TopBar kind="title" title="New night" back={{ label: "When", onPress: plan.back }} />
        {banner}
        <WhoStep
          scheduledFor={state.date}
          today={today}
          members={state.members}
          attendeeIds={state.attendeeIds}
          pickerId={state.pickerId}
          busy={state.busy}
          onToggle={(m: Member) => void plan.toggle(m.id)}
          onChoosePicker={plan.choosePicker}
          onNext={() => void onCreate()}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TopBar
        kind="title"
        title="New night"
        back={{ label: "Cancel", onPress: () => router.back() }}
      />
      {banner}
      <WhenStep
        today={today}
        initial={state.date}
        initialStartTime={state.startTime}
        nightDates={state.nightDates}
        busy={state.busy}
        onNext={plan.chooseDate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  center: { marginTop: space[8], textAlign: "center" },
  error: { ...textPresets.body, color: colors.text.danger },
  banner: { paddingVertical: space[2], paddingHorizontal: space[5], textAlign: "center" },
});
