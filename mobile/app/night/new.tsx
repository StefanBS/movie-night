import {
  useCallback,
  useEffect,
  useMemo,
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
import { WhenStep, WhoStep, PickStep, RecordedStep } from "../../components/night";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { todayLocalISO } from "../../lib/date";
import { errorMessage } from "../../lib/errors";
import { fetchMembers, type Member } from "../../lib/members";
import {
  addAttendee,
  attachMovie,
  createNight,
  getCurrentNight,
  getNightTurn,
  listNights,
  recordNightPick,
  removeAttendee,
  type Night,
} from "../../lib/nights";
import { searchMovies, type Movie } from "../../lib/movies";
import { nightDates } from "../../lib/calendar";
import { type TurnMember } from "../../lib/turn";
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
  const [order, setOrder] = useState<TurnMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // The id with an action in flight: a member id (attendance / pick), "create"
  // while creating, or the movie's tmdbId (as a string) while attaching.
  const [busy, setBusy] = useState<string | null>(null);
  const [nightDatesSet, setNightDatesSet] = useState<Set<string>>(new Set());
  const today = todayLocalISO();
  const [step, setStep] = useState<Step>("when");
  const [movieQuery, setMovieQuery] = useState("");
  const [results, setResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [changingPicker, setChangingPicker] = useState(false);

  // Resume the group's open night (if any) and land on the right step. The
  // backend enforces at most one open night per group, so resume is unambiguous.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const [roster, current, allNights] = await Promise.all([
          fetchMembers(API_URL, GROUP_ID, controller.signal),
          getCurrentNight(API_URL, GROUP_ID, controller.signal),
          listNights(API_URL, GROUP_ID, controller.signal).catch(() => [] as Night[]),
        ]);
        setMembers(roster);
        setNightDatesSet(nightDates(allNights));
        // Resume only an in-progress night. A night with a movie attached is
        // done, so we leave night === null and show "Start tonight's night",
        // which creates a fresh one — rather than re-opening a finished night.
        if (current !== null && isResumable(current)) {
          setNight(current);
          setStep(deriveInitialStep(current));
          setOrder(await getNightTurn(API_URL, GROUP_ID, current.id, controller.signal));
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

  const attendeeIds = useMemo(
    () => new Set((night?.attendees ?? []).map((a) => a.id)),
    [night],
  );

  const refreshOrder = useCallback(async (nightId: string) => {
    setOrder(await getNightTurn(API_URL, GROUP_ID, nightId));
  }, []);

  // runNightWrite is the shared envelope for write actions: guard against a
  // concurrent action, mark busyKey in flight, run the write, adopt the returned
  // night, then refresh the pick order — reporting a refresh failure on its own
  // so a successful write is never shown as failed. Returns the updated night,
  // or null on failure, so callers can advance the step only on success.
  const runNightWrite = useCallback(
    async (
      busyKey: string,
      write: () => Promise<Night>,
      fallback: string,
      clearOrder = false,
    ): Promise<Night | null> => {
      if (busy !== null) {
        return null;
      }
      setBusy(busyKey);
      setActionError(null);
      try {
        const updated = await write();
        setNight(updated);
        if (clearOrder) {
          setOrder([]);
        }
        try {
          await refreshOrder(updated.id);
        } catch (e) {
          setActionError(errorMessage(e, "failed to load pick order"));
        }
        return updated;
      } catch (e) {
        setActionError(errorMessage(e, fallback));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [busy, refreshOrder],
  );

  const onCreate = useCallback(
    async (scheduledFor: string) => {
      const created = await runNightWrite(
        "create",
        () => createNight(API_URL, GROUP_ID, scheduledFor),
        "failed to create night",
        true,
      );
      if (created !== null) {
        setStep("who");
      }
    },
    [runNightWrite],
  );

  const onToggle = useCallback(
    (member: Member) => {
      if (night === null) {
        return;
      }
      return runNightWrite(
        member.id,
        () =>
          attendeeIds.has(member.id)
            ? removeAttendee(API_URL, GROUP_ID, night.id, member.id)
            : addAttendee(API_URL, GROUP_ID, night.id, member.id),
        "failed to update attendance",
      );
    },
    [night, attendeeIds, runNightWrite],
  );

  // onAdvanceToPick records the auto-picker (the next-up present core member)
  // then moves to the pick step. Recording is what credits the turn, so it must
  // happen — a movie alone does not advance fairness standings.
  const onAdvanceToPick = useCallback(async () => {
    const top = order[0] ?? null;
    if (night === null || top === null) {
      return;
    }
    const recorded = await runNightWrite(
      top.id,
      () => recordNightPick(API_URL, GROUP_ID, night.id, top.id),
      "failed to record pick",
    );
    if (recorded !== null) {
      setStep("pick");
    }
  }, [night, order, runNightWrite]);

  // onRecordPicker corrects the night's picker to another present attendee.
  const onRecordPicker = useCallback(
    async (memberId: string) => {
      if (night === null) {
        return;
      }
      const recorded = await runNightWrite(
        memberId,
        () => recordNightPick(API_URL, GROUP_ID, night.id, memberId),
        "failed to record pick",
      );
      if (recorded !== null) {
        setChangingPicker(false);
      }
    },
    [night, runNightWrite],
  );

  const onSearch = useCallback(async () => {
    const q = movieQuery.trim();
    if (q === "" || busy !== null || searching) {
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await searchMovies(API_URL, q));
    } catch (e) {
      setSearchError(errorMessage(e, "search failed"));
    } finally {
      setSearching(false);
    }
  }, [movieQuery, busy, searching]);

  // onAttach sets (or changes) the movie, then advances to Recorded. Bypasses
  // runNightWrite because it advances the step and clears search state on success.
  const onAttach = useCallback(
    async (tmdbId: number) => {
      if (night === null || busy !== null) {
        return;
      }
      setBusy(String(tmdbId));
      setActionError(null);
      try {
        const updated = await attachMovie(API_URL, GROUP_ID, night.id, tmdbId);
        setNight(updated);
        setResults([]);
        setSearchError(null);
        setMovieQuery("");
        setStep("recorded");
      } catch (e) {
        setActionError(errorMessage(e, "failed to attach movie"));
      } finally {
        setBusy(null);
      }
    },
    [night, busy],
  );

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

  const back =
    step === "pick"
      ? {
          label: "Here",
          onPress: () => {
            setChangingPicker(false);
            setStep("who");
          },
        }
      : { label: "Cancel", onPress: () => router.back() };
  const title = step === "pick" ? "The pick" : step === "recorded" ? "Tonight" : "New night";

  return (
    <View style={styles.screen}>
      <TopBar
        kind="title"
        title={title}
        back={step === "recorded" ? undefined : back}
      />
      {actionError !== null ? (
        <Text style={[styles.banner, styles.error]}>{actionError}</Text>
      ) : null}

      {night === null ? (
        <WhenStep today={today} nightDates={nightDatesSet} busy={busy} onNext={onCreate} />
      ) : step === "who" ? (
        <WhoStep
          night={night}
          members={members}
          order={order}
          attendeeIds={attendeeIds}
          busy={busy}
          onToggle={onToggle}
          onNext={onAdvanceToPick}
        />
      ) : step === "pick" ? (
        <PickStep
          night={night}
          members={members}
          busy={busy}
          changingPicker={changingPicker}
          setChangingPicker={setChangingPicker}
          movieQuery={movieQuery}
          setMovieQuery={setMovieQuery}
          results={results}
          searching={searching}
          searchError={searchError}
          onSearch={onSearch}
          onAttach={onAttach}
          onRecordPicker={onRecordPicker}
        />
      ) : (
        <RecordedStep
          night={night}
          members={members}
          onDone={() => router.back()}
          onChangeMovie={() => setStep("pick")}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  center: { marginTop: space[8], textAlign: "center" },
  error: { ...textPresets.body, color: colors.text.danger },
  banner: { paddingVertical: space[2], paddingHorizontal: space[5], textAlign: "center" },
});
