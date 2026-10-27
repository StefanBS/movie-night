import {
  useCallback,
  useState,
} from "react";
import { View, StyleSheet } from "react-native";

import { TopBar } from "../";
import { NightSteps, type Step } from "./NightSteps";
import { API_URL } from "../../apiUrl";
import { GROUP_ID } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import type { Member } from "../../lib/members";
import { nightTiming } from "../../lib/nightLifecycle";
import {
  attachMovie,
  detachMovie,
  recordNightPick,
  type Night,
} from "../../lib/nights";
import { searchMovies, type Movie } from "../../lib/movies";
import { colors } from "../../theme";

// ExistingNightEditor is the Pick → Night editor for a saved Night. It keeps
// the stored picker: only an explicit "Choose who picks" changes it. Mount with
// key={night.id} when the loaded night changes.
export function ExistingNightEditor({
  night,
  members,
  today,
  initialStep = "night",
  onDone,
  onCancel,
  onEdit,
  cancelLabel = "Cancel",
  showBackOnNight = false,
}: {
  night: Night;
  members: Member[];
  today: string;
  initialStep?: Step;
  onDone: () => void;
  onCancel: () => void;
  onEdit?: () => void;
  cancelLabel?: string;
  showBackOnNight?: boolean;
}) {
  const [nightState, setNightState] = useState(night);
  const [step, setStep] = useState<Step>(initialStep);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [movieQuery, setMovieQuery] = useState("");
  const [results, setResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [changingPicker, setChangingPicker] = useState(false);

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
        return updated;
      } catch (e) {
        setActionError(errorMessage(e, fallback));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [busy],
  );

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
      const updated = await runNightWrite(
        String(tmdbId),
        () => attachMovie(API_URL, GROUP_ID, nightState.id, tmdbId),
        "failed to attach movie",
      );
      if (updated !== null) {
        setResults([]);
        setSearchError(null);
        setMovieQuery("");
        setStep("night");
      }
    },
    [nightState.id, runNightWrite],
  );

  const toNight = useCallback(() => {
    setChangingPicker(false);
    setStep("night");
  }, []);

  const onPickFilm = useCallback(() => {
    setStep("pick");
  }, []);

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
  // The Night step is the only one that can be back-less: it is the editor's
  // resting state, so it shows a back target only when the caller asked for one.
  const back =
    step === "pick"
      ? { label: "Night", onPress: toNight }
      : showBackOnNight
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
        busy={busy}
        actionError={actionError}
        future={nightTiming(nightState.scheduledFor, today) === "upcoming"}
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
        onSkipPick={toNight}
        onDone={onDone}
        onPickFilm={onPickFilm}
        onClearFilm={onClearFilm}
        onEdit={onEdit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
});
