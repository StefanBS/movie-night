import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";

import { resolveApiBaseUrl } from "./lib/api";
import { todayLocalISO } from "./lib/date";
import { recordPick } from "./lib/picks";
import { fetchTurn, type TurnMember } from "./lib/turn";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});
const GROUP_ID = "11111111-1111-1111-1111-111111111111";

export default function App() {
  const [turn, setTurn] = useState<TurnMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);

  const loadTurn = useCallback(async (signal?: AbortSignal) => {
    const data = await fetchTurn(API_URL, GROUP_ID, signal);
    setTurn(data);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        await loadTurn(controller.signal);
      } catch (e) {
        if (controller.signal.aborted) {
          return;
        }
        setError(e instanceof Error ? e.message : "failed to load turn order");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [loadTurn]);

  const onRecord = useCallback(
    async (member: TurnMember) => {
      if (recordingId !== null) {
        return;
      }
      setRecordingId(member.id);
      setError(null);
      try {
        // No abort signal here on purpose: a pick write should finish even if
        // the screen unmounts mid-request, and a stray state set after unmount
        // is benign under React 18.
        await recordPick(API_URL, GROUP_ID, {
          pickerId: member.id,
          scheduledFor: todayLocalISO(),
          isCredited: true,
        });
        await loadTurn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to record pick");
      } finally {
        setRecordingId(null);
      }
    },
    [recordingId, loadTurn],
  );

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Whose turn?</Text>
        {loading ? (
          <ActivityIndicator style={styles.center} size="large" />
        ) : error ? (
          <Text style={[styles.center, styles.error]}>
            {`Couldn't load turn order: ${error}`}
          </Text>
        ) : turn.length === 0 ? (
          <Text style={styles.center}>No members yet.</Text>
        ) : (
          <FlatList
            data={turn}
            keyExtractor={(m) => m.id}
            renderItem={({ item, index }) => {
              const isPicker = index === 0;
              const picks = `${item.servedCount} pick${item.servedCount === 1 ? "" : "s"}`;
              const last = item.lastPickedOn ?? "never";
              const isRecording = recordingId === item.id;
              return (
                <Pressable
                  onPress={() => onRecord(item)}
                  disabled={recordingId !== null}
                  style={({ pressed }) => [
                    styles.row,
                    isPicker && styles.pickerRow,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.rowMain}>
                    <Text style={styles.name}>{item.name}</Text>
                    {isPicker && (
                      <Text style={styles.badge}>{"Tonight's pick"}</Text>
                    )}
                  </View>
                  <Text style={styles.meta}>
                    {isRecording ? "Recording…" : `${picks} · last: ${last}`}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  title: { fontSize: 28, fontWeight: "600", marginBottom: 16 },
  center: { marginTop: 32, textAlign: "center" },
  error: { color: "#b00020" },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
  },
  rowPressed: { opacity: 0.6 },
  pickerRow: {
    backgroundColor: "#eef6ff",
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  rowMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: { fontSize: 18 },
  badge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0b66c3",
    textTransform: "uppercase",
  },
  meta: { fontSize: 14, color: "#666", marginTop: 4 },
});
