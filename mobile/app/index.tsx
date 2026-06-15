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
import {
  colors,
  space,
  radius,
  borderWidth,
  shadow,
  textPresets,
} from "../theme";

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
        <ActivityIndicator
          style={styles.center}
          size="large"
          color={colors.accent.base}
        />
      ) : error ? (
        <Text style={[styles.center, styles.error]}>
          {`Couldn't load turn order: ${error}`}
        </Text>
      ) : turn.length === 0 ? (
        <Text style={[styles.center, styles.empty]}>No members yet.</Text>
      ) : (
        <FlatList
          data={turn}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
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
  container: {
    flex: 1,
    backgroundColor: colors.surface.page, // the dim room
    paddingHorizontal: space[4],
  },
  links: { flexDirection: "row", justifyContent: "flex-end", gap: space[5] },
  manageLink: {
    ...textPresets.body,
    color: colors.accent.cool, // moonlight links
    paddingVertical: space[3],
    textAlign: "right",
  },
  center: { marginTop: space[8], textAlign: "center" },
  empty: { ...textPresets.body, color: colors.text.secondary },
  error: { ...textPresets.body, color: colors.text.danger },
  list: { paddingBottom: space[6] },
  row: {
    paddingVertical: space[3],
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  pickerRow: {
    backgroundColor: colors.surface.spotlight, // ember wash — "next up"
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.accent.base, // ember ring
    paddingHorizontal: space[3],
    ...shadow.spotlight, // the bonfire halo
  },
  rowMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: { ...textPresets.rowName, color: colors.text.primary },
  badge: { ...textPresets.tag, color: colors.accent.strong }, // mono uppercase ember
  meta: { ...textPresets.meta, color: colors.text.secondary, marginTop: space[1] },
});
