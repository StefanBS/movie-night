import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Button,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";

import { resolveApiBaseUrl } from "../lib/api";
import { todayLocalISO } from "../lib/date";
import { fetchMembers, type Member } from "../lib/members";
import {
  addAttendee,
  createNight,
  getNightTurn,
  removeAttendee,
  type Night,
} from "../lib/nights";
import { type TurnMember } from "../lib/turn";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});
const GROUP_ID = "11111111-1111-1111-1111-111111111111";

export default function NightScreen() {
  const [members, setMembers] = useState<Member[]>([]);
  const [night, setNight] = useState<Night | null>(null);
  const [order, setOrder] = useState<TurnMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // The member id with an action in flight, or "create" while creating.
  const [busy, setBusy] = useState<string | null>(null);

  // Load the full roster (everyone — guests AND inactive members) so anyone
  // present can be recorded. Attendance is presence; the pick order (getNightTurn)
  // filters to active core, so guests/inactive attendees never appear in it.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setMembers(await fetchMembers(API_URL, GROUP_ID, controller.signal));
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
        <>
          <Text style={styles.heading}>{`Night of ${night.scheduledFor}`}</Text>
          {actionError !== null && <Text style={[styles.banner, styles.error]}>{actionError}</Text>}

          <Text style={styles.section}>{"Who's here?"}</Text>
          <FlatList
            data={members}
            keyExtractor={(m) => m.id}
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
                    <View key={m.id} style={[styles.orderRow, i === 0 && styles.pickerRow]}>
                      <Text style={styles.name}>{`${i + 1}. ${m.name}`}</Text>
                      {i === 0 && <Text style={styles.badge}>{"Tonight's pick"}</Text>}
                    </View>
                  ))
                )}
                {guestsPresent.length > 0 && (
                  <Text style={styles.hint}>
                    {`Also present: ${guestsPresent.map((g) => g.name).join(", ")}`}
                  </Text>
                )}
              </View>
            }
          />
        </>
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
});
