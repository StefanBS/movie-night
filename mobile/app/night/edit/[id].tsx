import { useCallback } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { TopBar } from "../../../components";
import { EditNightScreen } from "../../../components/night/EditNightScreen";
import { useSession } from "../../../components/useSession";
import { API_URL } from "../../../apiUrl";
import { GROUP_ID } from "../../../lib/api";
import { todayLocalISO } from "../../../lib/date";
import { createNightLoad, nightLoadView } from "../../../lib/nightLoad";
import { colors, space, textPresets } from "../../../theme";

export default function NightEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NightEditLoader key={id} id={id} />;
}

// NightEditLoader loads the Night on every focus (lib/nightLoad). Only the
// first load shows the spinner: the editor holds unsaved drafts, so a refocus
// refresh must not unmount it. The draft keeps the Night it opened with; a
// refresh only updates the calendar's dots.
function NightEditLoader({ id }: { id: string }) {
  const router = useRouter();
  const [load, state] = useSession(() =>
    createNightLoad({ baseUrl: API_URL, groupId: GROUP_ID, nightId: id, withNightDates: true }),
  );
  const { night, members, nightDates, error } = state;
  const view = nightLoadView(state);
  const today = todayLocalISO();

  useFocusEffect(
    useCallback(() => {
      void load.load();
    }, [load]),
  );

  if (view === "loading") {
    return (
      <View style={styles.screen}>
        <TopBar
          kind="title"
          title="Edit night"
          back={{ label: "Up next", onPress: () => router.back() }}
        />
        <ActivityIndicator style={styles.center} size="large" color={colors.accent.base} />
      </View>
    );
  }

  if (view === "failed") {
    return (
      <View style={styles.screen}>
        <TopBar
          kind="title"
          title="Edit night"
          back={{ label: "Up next", onPress: () => router.back() }}
        />
        <Text style={[styles.center, styles.error]}>
          {`Couldn't load night: ${error}`}
        </Text>
      </View>
    );
  }

  if (night === null) {
    return (
      <View style={styles.screen}>
        <TopBar
          kind="title"
          title="Edit night"
          back={{ label: "Up next", onPress: () => router.back() }}
        />
        <View style={styles.body}>
          <Text style={styles.muted}>{"Couldn't find that night."}</Text>
        </View>
      </View>
    );
  }

  return (
    <EditNightScreen
      key={night.id}
      night={night}
      members={members}
      today={today}
      nightDates={nightDates}
      onBack={() => router.back()}
      onSaved={() => router.back()}
      onCancelled={() => router.replace("/")}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  center: { flex: 1, textAlignVertical: "center", textAlign: "center", paddingHorizontal: space[5] },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  error: { ...textPresets.body, color: colors.text.danger },
  muted: { ...textPresets.body, color: colors.text.secondary },
});
