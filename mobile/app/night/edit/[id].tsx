import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";

import { TopBar } from "../../../components";
import { EditNightScreen } from "../../../components/night/EditNightScreen";
import { GROUP_ID, resolveApiBaseUrl } from "../../../lib/api";
import { todayLocalISO } from "../../../lib/date";
import { errorMessage } from "../../../lib/errors";
import { fetchMembers, type Member } from "../../../lib/members";
import { getNightOrNull, listNights, type Night } from "../../../lib/nights";
import { colors, space, textPresets } from "../../../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

export default function NightEditRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [night, setNight] = useState<Night | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [nightDates, setNightDates] = useState<Set<string>>(new Set());
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
          setNightDates(new Set(planned.map((p) => p.scheduledFor)));
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
      nightDates={nightDates}
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
