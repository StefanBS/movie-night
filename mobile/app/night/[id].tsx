import { useCallback } from "react";
import {
  ActivityIndicator,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { TopBar } from "../../components";
import { ExistingNightEditor } from "../../components/night/ExistingNightEditor";
import { useSession } from "../../components/useSession";
import { API_URL } from "../../apiUrl";
import { GROUP_ID } from "../../lib/api";
import { todayLocalISO } from "../../lib/date";
import { createNightLoad, nightLoadView } from "../../lib/nightLoad";
import { createThemedStyles, space, textPresets, useColors } from "../../theme";

export default function NightDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NightDetailLoader key={id} id={id} />;
}

// NightDetailLoader loads the Night on every focus (lib/nightLoad). Only the
// first load shows the spinner, so returning from the Edit screen refreshes the
// Night under a still-mounted editor instead of resetting its step and search.
function NightDetailLoader({ id }: { id: string }) {
  const colors = useColors();
  const styles = useStyles();
  const router = useRouter();
  const [load, state] = useSession(() =>
    createNightLoad({ baseUrl: API_URL, groupId: GROUP_ID, nightId: id }),
  );
  const { night, members, error, loadStartedAt } = state;
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
          title="Night"
          back={{ label: "Back", onPress: () => router.back() }}
        />
        <ActivityIndicator
          style={styles.center}
          size="large"
          color={colors.text.secondary}
        />
      </View>
    );
  }

  if (view === "failed") {
    return (
      <View style={styles.screen}>
        <TopBar
          kind="title"
          title="Night"
          back={{ label: "Back", onPress: () => router.back() }}
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
          title="Night"
          back={{ label: "Back", onPress: () => router.back() }}
        />
        <View style={styles.body}>
          <Text style={styles.muted}>{"Couldn't find that night."}</Text>
        </View>
      </View>
    );
  }

  return (
    <ExistingNightEditor
      key={night.id}
      night={night}
      members={members}
      loadStartedAt={loadStartedAt}
      today={today}
      onDone={() => router.back()}
      onCancel={() => router.back()}
      onEdit={() =>
        router.push({ pathname: "/night/edit/[id]", params: { id: night.id } })
      }
      cancelLabel="Back"
      showBackOnNight
    />
  );
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  center: { flex: 1, textAlignVertical: "center", textAlign: "center", paddingHorizontal: space[5] },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  error: { ...textPresets.body, color: colors.text.danger },
  muted: { ...textPresets.body, color: colors.text.secondary },
}));
