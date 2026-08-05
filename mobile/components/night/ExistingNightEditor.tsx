import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { View, StyleSheet } from "react-native";

import { TopBar } from "../";
import { NightSteps } from "./NightSteps";
import { API_URL } from "../../apiUrl";
import { GROUP_ID } from "../../lib/api";
import { daysUntil } from "../../lib/date";
import { errorMessage } from "../../lib/errors";
import type { Member } from "../../lib/members";
import {
  addAttendee,
  attachMovie,
  detachMovie,
  getNightTurn,
  recordNightPick,
  removeAttendee,
  type Night,
} from "../../lib/nights";
import { searchMovies, type Movie } from "../../lib/movies";
import type { Step } from "../../lib/nightFlow";
import type { TurnMember } from "../../lib/turn";
import { colors } from "../../theme";

// ExistingNightEditor is the Who → Pick → Night wizard for a night that
// already exists. Mount with key={night.id} when the loaded night changes.
export function ExistingNightEditor({
  night,
  members,
  today,
  initialStep,
  onDone,
  onCancel,
  cancelLabel = "Cancel",
  showBackOnNight = false,
}: {
  night: Night;
  members: Member[];
  today: string;
  initialStep: Step;
  onDone: () => void;
  onCancel: () => void;
  cancelLabel?: string;
  showBackOnNight?: boolean;
}) {
  const [nightState, setNightState] = useState(night);
  const [step, setStep] = useState<Step>(initialStep);
  const [pickReturnStep, setPickReturnStep] = useState<Step>("who");
  const [order, setOrder] = useState<TurnMember[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [movieQuery, setMovieQuery] = useState("");
  const [results, setResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [changingPicker, setChangingPicker] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setOrder(await getNightTurn(API_URL, GROUP_ID, nightState.id, controller.signal));
      } catch {
        // Order refresh failures surface on the next write.
      }
    })();
    return () => controller.abort();
  }, [nightState.id]);

  const attendeeIds = useMemo(
    () => new Set(nightState.attendees.map((a) => a.id)),
    [nightState],
  );

  const refreshOrder = useCallback(async (nightId: string) => {
    setOrder(await getNightTurn(API_URL, GROUP_ID, nightId));
  }, []);

  const runNightWrite = useCallback(
    async (
      busyKey: string,
      write: () => Promise<Night>,
      fallback: string,
    ): Promise<Night | null> => {
      if (busy !== null) {
        return null;
      }
      setBusy(busyKey);
      setActionError(null);
      try {
        const updated = await write();
        setNightState(updated);
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

  const onToggle = useCallback(
    (member: Member) => {
      return runNightWrite(
        member.id,
        () =>
          attendeeIds.has(member.id)
            ? removeAttendee(API_URL, GROUP_ID, nightState.id, member.id)
            : addAttendee(API_URL, GROUP_ID, nightState.id, member.id),
        "failed to update attendance",
      );
    },
    [nightState.id, attendeeIds, runNightWrite],
  );

  const onAdvance = useCallback(async () => {
    const top = order[0] ?? null;
    if (top === null) {
      return;
    }
    const recorded = await runNightWrite(
      top.id,
      () => recordNightPick(API_URL, GROUP_ID, nightState.id, top.id),
      "failed to record pick",
    );
    if (recorded !== null) {
      setPickReturnStep("who");
      setStep("pick");
    }
  }, [nightState.id, order, runNightWrite]);

  const onRecordPicker = useCallback(
    async (memberId: string) => {
      const recorded = await runNightWrite(
        memberId,
        () => recordNightPick(API_URL, GROUP_ID, nightState.id, memberId),
        "failed to record pick",
      );
      if (recorded !== null) {
        setChangingPicker(false);
      }
    },
    [nightState.id, runNightWrite],
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

  const onAttach = useCallback(
    async (tmdbId: number) => {
      if (busy !== null) {
        return;
      }
      setBusy(String(tmdbId));
      setActionError(null);
      try {
        const updated = await attachMovie(API_URL, GROUP_ID, nightState.id, tmdbId);
        setNightState(updated);
        setResults([]);
        setSearchError(null);
        setMovieQuery("");
        setStep("night");
      } catch (e) {
        setActionError(errorMessage(e, "failed to attach movie"));
      } finally {
        setBusy(null);
      }
    },
    [nightState.id, busy],
  );

  const onSkipPick = useCallback(() => {
    setStep("night");
  }, []);

  const onPickFilm = useCallback(() => {
    setPickReturnStep("night");
    setStep("pick");
  }, []);

  const onBackFromPick = useCallback(() => {
    setChangingPicker(false);
    setStep(pickReturnStep);
  }, [pickReturnStep]);

  const onClearFilm = useCallback(async () => {
    if (busy !== null || nightState.movie === null) {
      return;
    }
    const updated = await runNightWrite(
      "clear-film",
      () => detachMovie(API_URL, GROUP_ID, nightState.id),
      "failed to clear film",
    );
    if (updated !== null) {
      setStep("night");
    }
  }, [nightState.id, nightState.movie, busy, runNightWrite]);

  const title = step === "pick" ? "The pick" : "Night";
  // The Night step is the only one that can be back-less: it is the wizard's
  // resting state, so it shows a back target only when the caller asked for one.
  const back =
    step === "pick"
      ? {
          label: pickReturnStep === "night" ? "Night" : "Here",
          onPress: onBackFromPick,
        }
      : step !== "night" || showBackOnNight
        ? { label: cancelLabel, onPress: onCancel }
        : undefined;

  return (
    <View style={styles.screen}>
      <TopBar kind="title" title={title} back={back} />
      <NightSteps
        night={nightState}
        members={members}
        today={today}
        step={step}
        order={order}
        attendeeIds={attendeeIds}
        busy={busy}
        actionError={actionError}
        future={daysUntil(nightState.scheduledFor, today) > 0}
        changingPicker={changingPicker}
        setChangingPicker={setChangingPicker}
        movieQuery={movieQuery}
        setMovieQuery={setMovieQuery}
        results={results}
        searching={searching}
        searchError={searchError}
        onToggle={onToggle}
        onAdvance={onAdvance}
        onSearch={onSearch}
        onAttach={onAttach}
        onRecordPicker={onRecordPicker}
        onSkipPick={onSkipPick}
        onDone={onDone}
        onPickFilm={onPickFilm}
        onClearFilm={onClearFilm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
});
