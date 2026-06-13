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

import { resolveApiBaseUrl } from "../lib/api";
import { todayLocalISO } from "../lib/date";
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
const GROUP_ID = "11111111-1111-1111-1111-111111111111";

// Poster renders a fixed-size TMDB thumbnail, or a plain neutral box when the
// movie has no poster (posterUrl null) — never a broken-image icon.
function Poster({ uri }: { uri: string | null }) {
  if (uri === null) {
    return <View style={[styles.poster, styles.posterPlaceholder]} />;
  }
  return <Image source={{ uri }} style={styles.poster} resizeMode="cover" />;
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
          setError(e instanceof Error ? e.message : "failed to load members");
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

  const onCreate = useCallback(async () => {
    if (busy !== null) {
      return;
    }
    setBusy("create");
    setActionError(null);
    try {
      // No abort signal on write actions: a create/attendance write should finish
      // even if the screen unmounts mid-request; a stray state set after unmount is
      // benign under React 18 (mirrors index.tsx's onRecord).
      const created = await createNight(API_URL, GROUP_ID, todayLocalISO());
      setNight(created);
      // The night was created; a failed order refresh shouldn't report the
      // create as failed. Surface refresh trouble on its own.
      try {
        await refreshOrder(created.id);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "failed to load pick order");
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "failed to create night");
    } finally {
      setBusy(null);
    }
  }, [busy, refreshOrder]);

  const onToggle = useCallback(
    async (member: Member) => {
      if (night === null || busy !== null) {
        return;
      }
      setBusy(member.id);
      setActionError(null);
      try {
        const updated = attendeeIds.has(member.id)
          ? await removeAttendee(API_URL, GROUP_ID, night.id, member.id)
          : await addAttendee(API_URL, GROUP_ID, night.id, member.id);
        setNight(updated);
        try {
          await refreshOrder(updated.id);
        } catch (e) {
          setActionError(e instanceof Error ? e.message : "failed to load pick order");
        }
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "failed to update attendance");
      } finally {
        setBusy(null);
      }
    },
    [night, busy, attendeeIds, refreshOrder],
  );

  const onRecordPick = useCallback(
    async (memberId: string) => {
      if (night === null || busy !== null) {
        return;
      }
      setBusy(memberId);
      setActionError(null);
      try {
        const updated = await recordNightPick(API_URL, GROUP_ID, night.id, memberId);
        setNight(updated);
        try {
          await refreshOrder(updated.id);
        } catch (e) {
          setActionError(e instanceof Error ? e.message : "failed to load pick order");
        }
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "failed to record pick");
      } finally {
        setBusy(null);
      }
    },
    [night, busy, refreshOrder],
  );

  const onStartNew = useCallback(async () => {
    if (busy !== null) {
      return;
    }
    setBusy("create");
    setActionError(null);
    try {
      const created = await createNight(API_URL, GROUP_ID, todayLocalISO());
      setNight(created);
      setOrder([]);
      try {
        await refreshOrder(created.id);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "failed to load pick order");
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "failed to start a new night");
    } finally {
      setBusy(null);
    }
  }, [busy, refreshOrder]);

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
      setSearchError(e instanceof Error ? e.message : "search failed");
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
        setActionError(e instanceof Error ? e.message : "failed to attach movie");
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
                  order.map((m, i) => {
                    const recorded = night?.pickerId === m.id;
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => onRecordPick(m.id)}
                        disabled={busy !== null}
                        style={({ pressed }) => [
                          styles.orderRow,
                          (recorded || (night?.pickerId == null && i === 0)) && styles.pickerRow,
                          pressed && styles.rowPressed,
                        ]}
                      >
                        <Text style={styles.name}>{`${i + 1}. ${m.name}`}</Text>
                        {recorded ? (
                          <Text style={styles.badge}>{"Recorded ✓"}</Text>
                        ) : night?.pickerId == null && i === 0 ? (
                          <Text style={styles.badge}>{"Tonight's pick"}</Text>
                        ) : null}
                      </Pressable>
                    );
                  })
                )}
                {guestsPresent.length > 0 && (
                  <>
                    <Text style={styles.section}>{"Also present"}</Text>
                    {guestsPresent.map((g) => {
                      const recorded = night?.pickerId === g.id;
                      return (
                        <Pressable
                          key={g.id}
                          onPress={() => onRecordPick(g.id)}
                          disabled={busy !== null}
                          style={({ pressed }) => [styles.orderRow, recorded && styles.pickerRow, pressed && styles.rowPressed]}
                        >
                          <Text style={styles.name}>{g.name}</Text>
                          {recorded && <Text style={styles.badge}>{"Recorded ✓"}</Text>}
                        </Pressable>
                      );
                    })}
                  </>
                )}
                {night?.pickerId != null && (
                  <View style={styles.createRow}>
                    <Text style={styles.hint}>{"Pick recorded. Tap another name to change it, or start the next night."}</Text>
                    <Button title="Start a new night" onPress={onStartNew} disabled={busy !== null} />
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
