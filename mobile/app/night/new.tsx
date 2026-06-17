import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

import { AppButton, Avatar, Badge, Input, Poster, SectionLabel, TopBar } from "../../components";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { formatShortDate, todayLocalISO } from "../../lib/date";
import { errorMessage } from "../../lib/errors";
import { fetchMembers, type Member } from "../../lib/members";
import {
  addAttendee,
  attachMovie,
  createNight,
  getCurrentNight,
  getNightTurn,
  recordNightPick,
  removeAttendee,
  type Night,
} from "../../lib/nights";
import { searchMovies, type Movie } from "../../lib/movies";
import { type TurnMember } from "../../lib/turn";
import { deriveInitialStep, type Step } from "../../lib/nightFlow";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  pressedOpacity,
  radius,
  shadow,
  space,
  textPresets,
  trackPx,
} from "../../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

const STEP_LABELS = ["Here", "Pick", "Done"] as const;

function firstNameOf(name: string): string {
  return name.split(" ")[0];
}

// Stepper is the wizard's three-dot progress rail (Here · Pick · Done). Dots
// before the current step show a check; the current dot is ember; the rest are
// muted. Tonight-only — "When" is prepended in Phase 3.
function Stepper({ current }: { current: number }) {
  return (
    <View style={styles.stepper}>
      {STEP_LABELS.map((label, i) => {
        const on = i === current;
        const done = i < current;
        return (
          <Fragment key={label}>
            {i > 0 ? (
              <View style={[styles.stepBar, done && styles.stepBarDone]} />
            ) : null}
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, (on || done) && styles.stepDotActive]}>
                <Text
                  style={[styles.stepDotText, (on || done) && styles.stepDotTextActive]}
                  allowFontScaling={false}
                >
                  {done ? "✓" : String(i + 1)}
                </Text>
              </View>
              <Text
                style={[styles.stepLabel, on && styles.stepLabelActive]}
                allowFontScaling={false}
              >
                {label}
              </Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

// WizardFooter pins a step's action(s) to the bottom, clearing the safe-area
// inset, with a hairline top edge over the page.
function WizardFooter({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: insets.bottom + space[4] }]}>
      {children}
    </View>
  );
}

// WhoStep — attendance toggles for the full roster. The next-up present core
// member (order[0]) is spotlighted as the picker; the footer records the pick
// and advances.
function WhoStep({
  night,
  members,
  order,
  attendeeIds,
  busy,
  onToggle,
  onNext,
}: {
  night: Night;
  members: Member[];
  order: TurnMember[];
  attendeeIds: Set<string>;
  busy: string | null;
  onToggle: (m: Member) => void;
  onNext: () => void;
}) {
  const picker = order[0] ?? null;
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <Stepper current={0} />
        <Text style={styles.heading}>{`Night of ${formatShortDate(night.scheduledFor)}`}</Text>
        <Text style={styles.hint}>
          {"Tap who made it. Tonight's pick goes to whoever's next up and here."}
        </Text>

        <SectionLabel>{"Who's here?"}</SectionLabel>
        {members.map((m) => {
          const here = attendeeIds.has(m.id);
          const isPicker = picker?.id === m.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => onToggle(m)}
              disabled={busy !== null}
              style={({ pressed }) => [
                styles.attendRow,
                isPicker ? styles.pickerRow : styles.attendDivider,
                !here && styles.dimmed,
                pressed && styles.rowPressed,
              ]}
            >
              <Avatar name={m.name} size={40} glow={isPicker} />
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {m.name}
                </Text>
                {isPicker ? <Text style={styles.getsPick}>GETS THE PICK</Text> : null}
              </View>
              {busy === m.id ? (
                <Text style={styles.tag}>…</Text>
              ) : here ? (
                <Badge label="✓ In" tone="solid" uppercase={false} />
              ) : (
                <Text style={styles.outTag}>OUT</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <WizardFooter>
        <AppButton
          title={picker ? `Next — ${firstNameOf(picker.name)} picks  →` : "Add who's here  →"}
          fullWidth
          disabled={busy !== null || picker === null}
          onPress={onNext}
        />
      </WizardFooter>
    </View>
  );
}

// PickStep — the picker spotlight (with a correction reveal over present
// attendees), then film search. Selecting a result attaches the movie and
// advances; selection is the action, so this step has no footer CTA.
function PickStep({
  night,
  members,
  busy,
  changingPicker,
  setChangingPicker,
  movieQuery,
  setMovieQuery,
  results,
  searching,
  searchError,
  onSearch,
  onAttach,
  onRecordPicker,
}: {
  night: Night;
  members: Member[];
  busy: string | null;
  changingPicker: boolean;
  setChangingPicker: (v: boolean) => void;
  movieQuery: string;
  setMovieQuery: (v: string) => void;
  results: Movie[];
  searching: boolean;
  searchError: string | null;
  onSearch: () => void;
  onAttach: (tmdbId: number) => void;
  onRecordPicker: (memberId: string) => void;
}) {
  const pickerName = members.find((m) => m.id === night.pickerId)?.name ?? "";
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Stepper current={1} />

        <View style={styles.pickerCard}>
          <Avatar name={pickerName} size={44} glow />
          <View style={styles.rowText}>
            <Text style={styles.pickingTag}>{"✦ Picking tonight"}</Text>
            <Text style={styles.pickerName} numberOfLines={1}>
              {pickerName}
            </Text>
          </View>
        </View>

        <View style={styles.changeRow}>
          <AppButton
            title={
              changingPicker
                ? "Keep this picker"
                : `Not ${firstNameOf(pickerName)}? Choose who picks`
            }
            variant="ghost"
            onPress={() => setChangingPicker(!changingPicker)}
            disabled={busy !== null}
          />
        </View>
        {changingPicker
          ? night.attendees.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => onRecordPicker(a.id)}
                disabled={busy !== null}
                style={({ pressed }) => [styles.chooseRow, pressed && styles.rowPressed]}
              >
                <Avatar name={a.name} size={32} />
                <Text style={[styles.name, styles.rowText]} numberOfLines={1}>
                  {a.name}
                </Text>
                {busy === a.id ? (
                  <Text style={styles.tag}>…</Text>
                ) : night.pickerId === a.id ? (
                  <Badge label="Picking" />
                ) : null}
              </Pressable>
            ))
          : null}

        <SectionLabel>{"Find a film"}</SectionLabel>
        <Input
          value={movieQuery}
          onChangeText={setMovieQuery}
          placeholder="Search a film title…"
          onSubmitEditing={onSearch}
          addonLabel="Search"
          onAddonPress={onSearch}
        />
        {searchError !== null ? (
          <Text style={[styles.hint, styles.error]}>{searchError}</Text>
        ) : null}
        {searching ? (
          <ActivityIndicator style={styles.searchSpinner} color={colors.accent.base} />
        ) : null}

        {results.map((mv) => (
          <Pressable
            key={mv.tmdbId}
            onPress={() => onAttach(mv.tmdbId)}
            disabled={busy !== null}
            style={({ pressed }) => [styles.resultRow, pressed && styles.rowPressed]}
          >
            <Poster uri={mv.posterUrl} title={mv.title} w={42} h={63} />
            <View style={styles.rowText}>
              <Text style={styles.resultTitle} numberOfLines={2}>
                {mv.title}
              </Text>
              {mv.releaseYear !== null ? (
                <Text style={styles.resultYear}>{mv.releaseYear}</Text>
              ) : null}
            </View>
            {busy === String(mv.tmdbId) ? <Text style={styles.tag}>…</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// RecordedStep — the finished-night hero: poster, RECORDED badge, title/year,
// who picked, and the who-watched cluster. Renders nothing if the movie is
// somehow absent (the container only mounts it when night.movie is set).
function RecordedStep({
  night,
  members,
  onDone,
  onChangeMovie,
}: {
  night: Night;
  members: Member[];
  onDone: () => void;
  onChangeMovie: () => void;
}) {
  if (night.movie === null) {
    return null;
  }
  const movie = night.movie;
  const pickerName = members.find((m) => m.id === night.pickerId)?.name ?? "";
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.recordedContent}>
        <Poster uri={movie.posterUrl} title={movie.title} w={150} h={222} />
        <View style={styles.recordedBadge}>
          <Badge label="Recorded ✓" tone="solid" />
        </View>
        <Text style={styles.recordedTitle} numberOfLines={3}>
          {movie.title}
        </Text>
        {movie.releaseYear !== null ? (
          <Text style={styles.recordedYear}>{movie.releaseYear}</Text>
        ) : null}

        <View style={styles.pickedBy}>
          <Avatar name={pickerName} size={28} />
          <Text style={styles.pickedByText}>
            {"Picked by "}
            <Text style={styles.pickedByName}>{pickerName}</Text>
            {` · ${formatShortDate(night.scheduledFor)}`}
          </Text>
        </View>

        <SectionLabel>{"Who watched"}</SectionLabel>
        <View style={styles.watchedCluster}>
          {night.attendees.map((a, i) => (
            <View key={a.id} style={[styles.watchedAvatar, i > 0 && styles.watchedOverlap]}>
              <Avatar name={a.name} size={40} />
            </View>
          ))}
        </View>
      </ScrollView>
      <WizardFooter>
        <AppButton title="Done — back to rotation" fullWidth onPress={onDone} />
        <View style={styles.changeMovieRow}>
          <AppButton title="Change movie" variant="ghost" onPress={onChangeMovie} />
        </View>
      </WizardFooter>
    </View>
  );
}

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
  const [step, setStep] = useState<Step>("who");
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
        const [roster, current] = await Promise.all([
          fetchMembers(API_URL, GROUP_ID, controller.signal),
          getCurrentNight(API_URL, GROUP_ID, controller.signal),
        ]);
        setMembers(roster);
        if (current !== null) {
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

  const onCreate = useCallback(async () => {
    const created = await runNightWrite(
      "create",
      () => createNight(API_URL, GROUP_ID, todayLocalISO()),
      "failed to create night",
      true,
    );
    if (created !== null) {
      setStep("who");
    }
  }, [runNightWrite]);

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
        <View style={styles.start}>
          <Text style={styles.hint}>{"Start tonight's night to record who's here."}</Text>
          <AppButton
            title="Start tonight's night"
            onPress={onCreate}
            disabled={busy !== null}
          />
        </View>
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
  flex: { flex: 1 },
  center: { marginTop: space[8], textAlign: "center" },
  error: { ...textPresets.body, color: colors.text.danger },
  banner: { paddingVertical: space[2], paddingHorizontal: space[5], textAlign: "center" },
  content: {
    paddingHorizontal: space[5],
    paddingTop: space[3],
    paddingBottom: space[6],
  },
  start: { marginTop: space[8], gap: space[3], alignItems: "center", paddingHorizontal: space[5] },
  hint: { ...textPresets.meta, color: colors.text.secondary },
  heading: {
    ...textPresets.screenTitle,
    color: colors.text.primary,
    marginTop: space[4],
  },
  footer: {
    paddingHorizontal: space[5],
    paddingTop: space[3],
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.border.hairline,
    backgroundColor: colors.surface.page,
    gap: space[2],
  },
  stepper: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[2] },
  stepItem: { flexDirection: "row", alignItems: "center", gap: space[1] },
  stepBar: { flex: 1, height: 1, backgroundColor: colors.border.hairline },
  stepBarDone: { backgroundColor: colors.accent.base },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface.subtle,
  },
  stepDotActive: { backgroundColor: colors.accent.base },
  stepDotText: { fontFamily: fontFamily.monoBold, fontSize: 10, color: colors.text.tertiary },
  stepDotTextActive: { color: colors.text.onAccent },
  stepLabel: { ...textPresets.tag, color: colors.text.tertiary },
  stepLabelActive: { color: colors.accent.strong },
  attendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[2],
  },
  attendDivider: {
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  pickerRow: {
    backgroundColor: colors.surface.spotlight,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.accent.base,
    ...shadow.spotlight,
  },
  dimmed: { opacity: 0.5 },
  rowPressed: { opacity: pressedOpacity },
  rowText: { flex: 1 },
  name: { ...textPresets.rowName, color: colors.text.primary },
  getsPick: { ...textPresets.tag, color: colors.accent.strong, marginTop: space[1] },
  outTag: { ...textPresets.tag, color: colors.text.tertiary },
  tag: { ...textPresets.tag, color: colors.text.secondary },
  pickerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    marginTop: space[4],
    backgroundColor: colors.surface.spotlight,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.accent.base,
    ...shadow.spotlight,
  },
  pickingTag: { ...textPresets.tag, color: colors.accent.strong },
  pickerName: { ...textPresets.screenTitle, color: colors.text.primary, marginTop: space[1] },
  changeRow: { marginTop: space[2], alignItems: "flex-start" },
  chooseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[2],
    paddingHorizontal: space[2],
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  searchSpinner: { marginTop: space[3] },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[2],
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  resultTitle: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 22,
    color: colors.text.primary,
  },
  resultYear: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    marginTop: space[1],
  },
  recordedContent: {
    paddingHorizontal: space[5],
    paddingTop: space[5],
    paddingBottom: space[6],
    alignItems: "center",
  },
  recordedBadge: { marginTop: space[5] },
  recordedTitle: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: trackPx(34, "display"),
    color: colors.text.primary,
    marginTop: space[3],
    textAlign: "center",
  },
  recordedYear: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginTop: space[2],
  },
  pickedBy: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[5] },
  pickedByText: { ...textPresets.meta, color: colors.text.secondary },
  pickedByName: { color: colors.text.primary, fontFamily: fontFamily.sansSemibold },
  watchedCluster: { flexDirection: "row", justifyContent: "center", paddingTop: space[2] },
  watchedAvatar: {
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: colors.surface.page,
  },
  watchedOverlap: { marginLeft: -space[2] },
  changeMovieRow: { alignItems: "center" },
});
