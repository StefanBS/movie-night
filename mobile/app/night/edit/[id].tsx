import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { TopBar } from "../../../components";
import { EditNightScreen } from "../../../components/night/EditNightScreen";
import { API_URL } from "../../../apiUrl";
import { GROUP_ID } from "../../../lib/api";
import { nightDates } from "../../../lib/calendar";
import { todayLocalISO } from "../../../lib/date";
import { errorMessage } from "../../../lib/errors";
import { fetchMembers, type Member } from "../../../lib/members";
import { getNightOrNull, listNights, type Night } from "../../../lib/nights";
import { colors, space, textPresets } from "../../../theme";

export default function NightEditRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [night, setNight] = useState<Night | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [nightDatesSet, setNightDatesSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = todayLocalISO();

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      (async () => {
        try {
          setLoading(true);
          const [n, roster, planned] = await Promise.all([
            getNightOrNull(API_URL, GROUP_ID, id, controller.signal),
            fetchMembers(API_URL, GROUP_ID, controller.signal),
            listNights(API_URL, GROUP_ID, controller.signal).catch(() => [] as Night[]),
          ]);
          setNight(n);
          setMembers(roster);
          setNightDatesSet(nightDates(planned));
          setError(null);
        } catch (e) {
          if (!controller.signal.aborted) {
            setError(errorMessage(e, "failed to load night"));
          }
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        }
      })();
      return () => controller.abort();
    }, [id]),
  );

  // Gated on "no night yet", not on loading: the editor holds unsaved drafts, so
  // the refocus refetch (pushing to Reminders and back) must not unmount it. A
  // failed refresh leaves the last-known-good night on screen.
  if (night === null && loading) {
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

  if (night === null && error !== null) {
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
      nightDates={nightDatesSet}
      apiUrl={API_URL}
      groupId={GROUP_ID}
      onBack={() => router.back()}
      onSaved={() => router.back()}
      onCancelled={() => router.replace("/")}
      onReminders={() =>
        router.push({ pathname: "/night/edit/reminders", params: { id: night.id } })
      }
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
