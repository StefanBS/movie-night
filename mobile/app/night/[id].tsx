import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";

import { TopBar } from "../../components";
import { ExistingNightEditor } from "../../components/night/ExistingNightEditor";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { todayLocalISO } from "../../lib/date";
import { errorMessage } from "../../lib/errors";
import { fetchMembers, type Member } from "../../lib/members";
import { deriveInitialStep, type Step } from "../../lib/nightFlow";
import { getNightOrNull, type Night } from "../../lib/nights";
import {
  colors,
  space,
  textPresets,
} from "../../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

export default function NightDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [night, setNight] = useState<Night | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [resumeStep, setResumeStep] = useState<Exclude<Step, "when">>("night");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = todayLocalISO();

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      const loadToday = todayLocalISO();
      (async () => {
        try {
          setLoading(true);
          const [n, roster] = await Promise.all([
            getNightOrNull(API_URL, GROUP_ID, id, controller.signal),
            fetchMembers(API_URL, GROUP_ID, controller.signal),
          ]);
          setNight(n);
          setMembers(roster);
          if (n !== null) {
            setResumeStep(deriveInitialStep(n, loadToday));
          }
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

  if (loading) {
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
          color={colors.accent.base}
        />
      </View>
    );
  }

  if (error !== null) {
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
      key={`${night.id}-${resumeStep}`}
      night={night}
      members={members}
      today={today}
      initialStep={resumeStep}
      onDone={() => router.back()}
      onCancel={() => router.back()}
      cancelLabel="Back"
      showBackOnNight
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
