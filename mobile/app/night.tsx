import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Button,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Constants from "expo-constants";

import { GROUP_ID, resolveApiBaseUrl } from "../lib/api";
import { todayLocalISO } from "../lib/date";
import { errorMessage } from "../lib/errors";
import { fetchMembers, type Member } from "../lib/members";
import {
  addAttendee,
  attachMovie,
  createNight,
  getCurrentNight,
  getNightTurn,
  recordNightPick,
  removeAttendee,
  type Night,
} from "../lib/nights";
import { movieLabel, searchMovies, type Movie } from "../lib/movies";
import { type TurnMember } from "../lib/turn";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

// Poster renders a fixed-size TMDB thumbnail, or a plain neutral box when the
// movie has no poster (posterUrl null) — never a broken-image icon.
function Poster({ uri }: { uri: string | null }) {
  if (uri === null) {
    return <View style={[styles.poster, styles.posterPlaceholder]} />;
  }
  return <Image source={{ uri }} style={styles.poster} resizeMode="cover" />;
}

// PickRow is one tappable name in the night's pick lists (the core pick order
// or the guests present). It highlights the recorded picker, or — before a pick
// is recorded — the implied next pick; tapping it records that member.
function PickRow({
  label,
  recorded,
  impliedPick,
  disabled,
  onPress,
}: {
  label: string;
  recorded: boolean;
  impliedPick: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.orderRow,
        (recorded || impliedPick) && styles.pickerRow,
        pressed && styles.rowPressed,
      ]}
    >
      <Text style={styles.name}>{label}</Text>
      {recorded ? (
        <Text style={styles.badge}>{"Recorded ✓"}</Text>
      ) : impliedPick ? (
        <Text style={styles.badge}>{"Tonight's pick"}</Text>
      ) : null}
    </Pressable>
  );
}

export default function NightScreen() {
  const [members, setMembers] = useState<Member[]>([]);
  const [night, setNight] = useState<Night | null>(null);
  const [order, setOrder] = useState<TurnMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // The member id with an action in flight, or "create" while creating.
  const [busy, setBusy] = useState<string | null>(null);

  const [movieQuery, setMovieQuery] = useState("");
  const [results, setResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Show the search UI when no movie is attached yet, or when the user taps
  // "Change movie" on a night that already has one.
  const [changingMovie, setChangingMovie] = useState(false);

  // Load the full roster (everyone — guests AND inactive members) so anyone
  // present can be recorded. Attendance is presence; the pick order (getNightTurn)
  // filters to active core, so guests/inactive attendees never appear in it. We
  // also resume the group's open night (if any) so leaving and returning doesn't
  // strand it — the backend enforces at most one open night per group (a partial
  // unique index), and create is idempotent, so resuming is always unambiguous.
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
          setOrder(await getNightTurn(API_URL, GROUP_ID, current.id, controller.signal));
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(errorMessage(e, "failed to load members"));
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

  // runNightWrite is the shared envelope for the screen's write actions: guard
  // against a concurrent action, mark `busyKey` in flight, run the write, adopt
  // the returned night, then refresh the pick order — reporting a refresh
  // failure on its own so a successful write is never shown as failed. When
  // `clearOrder` is set (starting a night) the previous order is dropped before
  // the refresh so it doesn't linger on screen.
  //
  // No abort signal on write actions: a write should finish even if the screen
  // unmounts mid-request; a stray state set after unmount is benign under React 18.
  const runNightWrite = useCallback(
    async (
      busyKey: string,
      write: () => Promise<Night>,
      fallback: string,
      clearOrder = false,
    ) => {
      if (busy !== null) {
        return;
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
      } catch (e) {
        setActionError(errorMessage(e, fallback));
      } finally {
        setBusy(null);
      }
    },
    [busy, refreshOrder],
  );

  // onCreate starts tonight's night — used both for the first night and to
  // start the next one (clearOrder drops the finished night's order).
  const onCreate = useCallback(
    () =>
      runNightWrite(
        "create",
        () => createNight(API_URL, GROUP_ID, todayLocalISO()),
        "failed to create night",
        true,
      ),
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

  const onRecordPick = useCallback(
    (memberId: string) => {
      if (night === null) {
        return;
      }
      return runNightWrite(
        memberId,
        () => recordNightPick(API_URL, GROUP_ID, night.id, memberId),
        "failed to record pick",
      );
    },
    [night, runNightWrite],
  );

  const onSearch = useCallback(async () => {
    const q = movieQuery.trim();
    if (q === "") {
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
  }, [movieQuery]);

  const onAttach = useCallback(
    async (tmdbId: number) => {
      if (night === null || busy !== null) {
        return;
      }
      setBusy("movie");
      setActionError(null);
      try {
        const updated = await attachMovie(API_URL, GROUP_ID, night.id, tmdbId);
        setNight(updated);
        setResults([]);
        setSearchError(null);
        setMovieQuery("");
        setChangingMovie(false);
      } catch (e) {
        setActionError(errorMessage(e, "failed to attach movie"));
      } finally {
        setBusy(null);
      }
    },
    [night, busy],
  );

  if (loading) {
    return <ActivityIndicator style={styles.center} size="large" />;
  }
  if (error !== null) {
    return <Text style={[styles.center, styles.error]}>{`Couldn't load members: ${error}`}</Text>;
  }

  const guestsPresent = (night?.attendees ?? []).filter((a) => a.role === "guest");

  return (
    <View style={styles.container}>
      {night === null ? (
        <View style={styles.createRow}>
          <Text style={styles.hint}>{"Start a night to record who's here."}</Text>
          <Button title="Start tonight's night" onPress={onCreate} disabled={busy !== null} />
        </View>
      ) : (
        // The whole screen is one FlatList so it scrolls as a unit: the
        // heading + movie search live in ListHeaderComponent, the members are
        // the data rows, and the pick order is the footer. Passing the header
        // as a JSX element (not a function component) keeps the search
        // TextInput from remounting — and losing focus — on every keystroke.
        <FlatList
          data={members}
          keyExtractor={(m) => m.id}
          ListHeaderComponent={
            <>
              <Text style={styles.heading}>{`Night of ${night.scheduledFor}`}</Text>
              <Text style={styles.hint}>
                {"Tap to add or remove — attendance saves automatically."}
              </Text>
              {actionError !== null && <Text style={[styles.banner, styles.error]}>{actionError}</Text>}

              <Text style={styles.section}>{"Tonight's movie"}</Text>
              {night.movie !== null && !changingMovie ? (
                <View style={styles.movieRow}>
                  <View style={styles.movieInfo}>
                    <Poster uri={night.movie.posterUrl} />
                    <Text style={styles.name}>{movieLabel(night.movie)}</Text>
                  </View>
                  <Button title="Change movie" onPress={() => setChangingMovie(true)} disabled={busy !== null} />
                </View>
              ) : (
                <View>
                  <View style={styles.searchRow}>
                    <TextInput
                      style={styles.input}
                      placeholder="Search a film title…"
                      value={movieQuery}
                      onChangeText={setMovieQuery}
                      onSubmitEditing={onSearch}
                      returnKeyType="search"
                      autoCorrect={false}
                    />
                    <Button title="Search" onPress={onSearch} disabled={searching || movieQuery.trim() === ""} />
                  </View>
                  {searchError !== null && <Text style={[styles.hint, styles.error]}>{searchError}</Text>}
                  {results.map((m) => (
                    <Pressable
                      key={m.tmdbId}
                      onPress={() => onAttach(m.tmdbId)}
                      disabled={busy !== null}
                      style={({ pressed }) => [styles.resultRow, pressed && styles.rowPressed]}
                    >
                      <Poster uri={m.posterUrl} />
                      <Text style={[styles.name, styles.resultLabel]}>{movieLabel(m)}</Text>
                      {busy === "movie" ? <Text style={styles.tag}>…</Text> : null}
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={styles.section}>{"Who's here?"}</Text>
            </>
          }
          renderItem={({ item }) => {
              const present = attendeeIds.has(item.id);
              const isBusy = busy === item.id;
              return (
                <Pressable
                  onPress={() => onToggle(item)}
                  disabled={busy !== null}
                  style={({ pressed }) => [styles.row, present && styles.rowPresent, pressed && styles.rowPressed]}
                >
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.tag}>{isBusy ? "…" : present ? "✓ here" : item.role}</Text>
                </Pressable>
              );
            }}
            ListFooterComponent={
              <View style={styles.orderBlock}>
                <Text style={styles.section}>Pick order</Text>
                {order.length === 0 ? (
                  <Text style={styles.hint}>No core members here yet.</Text>
                ) : (
                  order.map((m, i) => (
                    <PickRow
                      key={m.id}
                      label={`${i + 1}. ${m.name}`}
                      recorded={night?.pickerId === m.id}
                      impliedPick={night?.pickerId == null && i === 0}
                      disabled={busy !== null}
                      onPress={() => onRecordPick(m.id)}
                    />
                  ))
                )}
                {guestsPresent.length > 0 && (
                  <>
                    <Text style={styles.section}>{"Also present"}</Text>
                    {guestsPresent.map((g) => (
                      <PickRow
                        key={g.id}
                        label={g.name}
                        recorded={night?.pickerId === g.id}
                        impliedPick={false}
                        disabled={busy !== null}
                        onPress={() => onRecordPick(g.id)}
                      />
                    ))}
                  </>
                )}
                {night?.pickerId != null && (
                  <View style={styles.createRow}>
                    <Text style={styles.hint}>{"Pick recorded. Tap another name to change it, or start the next night."}</Text>
                    <Button title="Start a new night" onPress={onCreate} disabled={busy !== null} />
                  </View>
                )}
              </View>
            }
          />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  center: { marginTop: 32, textAlign: "center" },
  error: { color: "#b00020" },
  banner: { paddingVertical: 8, textAlign: "center" },
  createRow: { marginTop: 32, gap: 12, alignItems: "center" },
  hint: { fontSize: 14, color: "#666" },
  heading: { fontSize: 20, fontWeight: "600", paddingVertical: 12 },
  section: { fontSize: 14, fontWeight: "600", color: "#666", textTransform: "uppercase", marginTop: 12, marginBottom: 4 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
  },
  rowPresent: { backgroundColor: "#eef6ff", borderRadius: 8, paddingHorizontal: 8 },
  rowPressed: { opacity: 0.6 },
  name: { fontSize: 18 },
  tag: { fontSize: 12, fontWeight: "600", color: "#666", textTransform: "uppercase" },
  orderBlock: { paddingTop: 8 },
  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  pickerRow: { backgroundColor: "#eef6ff", borderRadius: 8, paddingHorizontal: 8 },
  badge: { fontSize: 12, fontWeight: "600", color: "#0b66c3", textTransform: "uppercase" },
  movieRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  poster: { width: 46, height: 69, borderRadius: 4, backgroundColor: "#eee" },
  posterPlaceholder: { borderWidth: StyleSheet.hairlineWidth, borderColor: "#ccc" },
  movieInfo: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  resultLabel: { flex: 1 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
});
