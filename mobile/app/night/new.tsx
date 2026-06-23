import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

import { TopBar } from "../../components";
import { WhenStep, ExistingNightEditor } from "../../components/night";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { todayLocalISO } from "../../lib/date";
import { errorMessage } from "../../lib/errors";
import { fetchMembers, type Member } from "../../lib/members";
import {
  createNight,
  getCurrentNight,
  listNights,
  type Night,
} from "../../lib/nights";
import { nightDates } from "../../lib/calendar";
import { deriveInitialStep, isResumable, type Step } from "../../lib/nightFlow";
import {
  colors,
  textPresets,
  space,
} from "../../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

export default function NightScreen() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [night, setNight] = useState<Night | null>(null);
  const [resumeStep, setResumeStep] = useState<Exclude<Step, "when">>("who");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nightDatesSet, setNightDatesSet] = useState<Set<string>>(new Set());
  const [createBusy, setCreateBusy] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const today = todayLocalISO();

  useEffect(() => {
    const controller = new AbortController();
    const resumeToday = todayLocalISO();
    (async () => {
      try {
        const [roster, current, allNights] = await Promise.all([
          fetchMembers(API_URL, GROUP_ID, controller.signal),
          getCurrentNight(API_URL, GROUP_ID, controller.signal),
          listNights(API_URL, GROUP_ID, controller.signal).catch(() => [] as Night[]),
        ]);
        setMembers(roster);
        setNightDatesSet(nightDates(allNights));
        if (current !== null && isResumable(current, resumeToday)) {
          setNight(current);
          setResumeStep(deriveInitialStep(current, resumeToday));
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(errorMessage(e, "failed to load tonight"));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  const onCreate = useCallback(async (scheduledFor: string) => {
    if (createBusy !== null) {
      return;
    }
    setCreateBusy("create");
    setCreateError(null);
    try {
      const created = await createNight(API_URL, GROUP_ID, scheduledFor);
      setNight(created);
      setResumeStep("who");
    } catch (e) {
      setCreateError(errorMessage(e, "failed to create night"));
    } finally {
      setCreateBusy(null);
    }
  }, [createBusy]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator style={styles.center} size="large" color={colors.accent.base} />
      </View>
    );
  }
  if (error !== null) {
    return (
      <View style={styles.screen}>
        <Text style={[styles.center, styles.error]}>{`Couldn't load tonight: ${error}`}</Text>
      </View>
    );
  }

  if (night !== null) {
    return (
      <ExistingNightEditor
        key={night.id}
        night={night}
        members={members}
        today={today}
        initialStep={resumeStep}
        onDone={() => router.back()}
        onCancel={() => router.back()}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <TopBar
        kind="title"
        title="New night"
        back={{ label: "Cancel", onPress: () => router.back() }}
      />
      {createError !== null ? (
        <Text style={[styles.banner, styles.error]}>{createError}</Text>
      ) : null}
      <WhenStep today={today} nightDates={nightDatesSet} busy={createBusy} onNext={onCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  center: { marginTop: space[8], textAlign: "center" },
  error: { ...textPresets.body, color: colors.text.danger },
  banner: { paddingVertical: space[2], paddingHorizontal: space[5], textAlign: "center" },
});
