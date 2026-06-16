import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

import { AppButton, Badge, MemberRow, TopBar } from "../components";
import { GROUP_ID, resolveApiBaseUrl } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { fetchTurn, pickerMeta, type TurnMember } from "../lib/turn";
import {
  borderWidth,
  colors,
  radius,
  space,
  textPresets,
} from "../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

// The fairness rule, stated plainly — the same logic the backend's turn query
// implements (fewest picks first, ties broken by who picked longest ago).
const FAIRNESS_NOTE =
  "Fewest picks goes first. Ties go to whoever picked longest ago — so everyone gets a fair turn. No voting.";

// Rank 1 is the picker — it gets the ember spotlight and the NEXT UP badge. The
// rest are plain rows separated by hairlines, in turn order.
function RotationList({ order }: { order: TurnMember[] }) {
  const [picker, ...rest] = order;
  return (
    <View style={styles.list}>
      <MemberRow
        rank={1}
        name={picker.name}
        meta={pickerMeta(picker)}
        spotlight
        right={<Badge label="Next up" />}
      />
      {rest.map((m, i) => (
        <View
          key={m.id}
          style={[styles.rest, i < rest.length - 1 && styles.divider]}
        >
          <MemberRow rank={i + 2} name={m.name} meta={pickerMeta(m)} />
        </View>
      ))}
    </View>
  );
}

export default function RotationScreen() {
  const router = useRouter();
  const [order, setOrder] = useState<TurnMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setOrder(await fetchTurn(API_URL, GROUP_ID, controller.signal));
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(errorMessage(e, "failed to load the rotation"));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  const firstName = order.length > 0 ? order[0].name.split(" ")[0] : "";

  return (
    <View style={styles.screen}>
      <TopBar
        kind="title"
        title="The order"
        back={{ label: "Tonight", onPress: () => router.back() }}
      />
      {loading ? (
        <ActivityIndicator
          style={styles.center}
          size="large"
          color={colors.accent.base}
        />
      ) : error !== null ? (
        <Text style={[styles.center, styles.error]}>
          {`Couldn't load the rotation: ${error}`}
        </Text>
      ) : order.length === 0 ? (
        <View style={styles.body}>
          <Text style={styles.empty}>{"No one's in the rotation yet."}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.infoStrip}>
            <Text style={styles.infoText}>{FAIRNESS_NOTE}</Text>
          </View>

          <RotationList order={order} />

          <View style={styles.skipRow}>
            {/* UI only — the skip-turn endpoint is tracked separately (#42). */}
            <AppButton
              title={`Skip ${firstName}'s turn`}
              variant="secondary"
              onPress={() => {}}
            />
          </View>

          <Text style={styles.footer}>
            {"Guests and inactive members don't enter the rotation."}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  center: { marginTop: space[8], textAlign: "center" },
  error: { ...textPresets.body, color: colors.text.danger },
  empty: { ...textPresets.body, color: colors.text.secondary, textAlign: "center" },
  content: {
    paddingHorizontal: space[5],
    paddingTop: space[4],
    paddingBottom: space[10],
  },
  infoStrip: {
    backgroundColor: colors.surface.subtle,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
    borderRadius: radius.md,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
  infoText: { ...textPresets.meta, color: colors.text.secondary },
  list: { marginTop: space[4] },
  // Non-spotlight rows sit flush with a hairline between them. MemberRow owns
  // its own horizontal padding, so the divider spans the full row.
  rest: { paddingHorizontal: space[2] },
  divider: {
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  skipRow: { marginTop: space[5], alignItems: "center" },
  footer: {
    ...textPresets.meta,
    color: colors.text.tertiary,
    textAlign: "center",
    marginTop: space[6],
  },
});
