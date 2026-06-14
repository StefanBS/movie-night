import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";
import { Link } from "expo-router";

import { GROUP_ID, resolveApiBaseUrl } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { fetchTurn, type TurnMember } from "../lib/turn";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

export default function TurnScreen() {
  const [turn, setTurn] = useState<TurnMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setTurn(await fetchTurn(API_URL, GROUP_ID, controller.signal));
      } catch (e) {
        if (controller.signal.aborted) {
          return;
        }
        setError(errorMessage(e, "failed to load turn order"));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.links}>
        <Link href="/night" style={styles.manageLink}>
          Tonight →
        </Link>
        <Link href="/manage" style={styles.manageLink}>
          Manage members →
        </Link>
      </View>
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
            return (
              <View style={[styles.row, isPicker && styles.pickerRow]}>
                <View style={styles.rowMain}>
                  <Text style={styles.name}>{item.name}</Text>
                  {isPicker && <Text style={styles.badge}>{"Next up"}</Text>}
                </View>
                <Text style={styles.meta}>{`${picks} · last: ${last}`}</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  links: { flexDirection: "row", justifyContent: "flex-end", gap: 20 },
  manageLink: {
    fontSize: 16,
    color: "#0b66c3",
    fontWeight: "600",
    paddingVertical: 12,
    textAlign: "right",
  },
  center: { marginTop: 32, textAlign: "center" },
  error: { color: "#b00020" },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
  },
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
