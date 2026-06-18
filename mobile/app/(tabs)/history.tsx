import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import Constants from "expo-constants";

import { Poster, SectionLabel, Stat, TopBar } from "../../components";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { formatShortDate } from "../../lib/date";
import { errorMessage } from "../../lib/errors";
import { buildHistoryMonths, historyStats } from "../../lib/history";
import { listNights, type Night } from "../../lib/nights";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  pressedOpacity,
  radius,
  space,
  textPresets,
} from "../../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

function firstNameOf(name: string): string {
  return name.split(" ")[0];
}

export default function HistoryScreen() {
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const [nights, setNights] = useState<Night[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refetch on focus (not just first mount): a night recorded on another tab
  // must show up when the user returns here, and the tab screen stays mounted.
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      (async () => {
        try {
          setNights(await listNights(API_URL, GROUP_ID, controller.signal));
          setError(null);
        } catch (e) {
          if (!controller.signal.aborted) {
            setError(errorMessage(e, "failed to load history"));
          }
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        }
      })();
      return () => controller.abort();
    }, []),
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <TopBar kind="tab" title="History" />
        <ActivityIndicator
          style={styles.center}
          size="large"
          color={colors.accent.base}
        />
      </View>
    );
  }

  if (error !== null) {
    return (
      <View style={styles.screen}>
        <TopBar kind="tab" title="History" />
        <View style={styles.body}>
          <Text style={styles.errorText}>{`Couldn't load history: ${error}`}</Text>
        </View>
      </View>
    );
  }

  if (nights.length === 0) {
    return (
      <View style={styles.screen}>
        <TopBar kind="tab" title="History" />
        <View style={styles.body}>
          <Text style={styles.empty}>No nights yet — start one.</Text>
        </View>
      </View>
    );
  }

  const stats = historyStats(nights);
  const months = buildHistoryMonths(nights);
  const open = (id: string) =>
    router.push({ pathname: "/night/[id]", params: { id } });

  return (
    <View style={styles.screen}>
      <TopBar kind="tab" title="History" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarHeight + space[5] },
        ]}
      >
        <View style={styles.stats}>
          <View style={styles.statCell}>
            <Stat value={stats.nights} label="Nights" />
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Stat value={stats.films} label="Films" />
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Stat value={stats.loved} label="Loved" accent />
          </View>
        </View>

        {months.map((month) => (
          <View key={month.label}>
            <SectionLabel>{month.label}</SectionLabel>
            {month.nights.map((n, i) => {
              const picker =
                n.attendees.find((a) => a.id === n.pickerId) ?? null;
              return (
                <Pressable
                  key={n.id}
                  onPress={() => open(n.id)}
                  style={({ pressed }) => [
                    styles.row,
                    i < month.nights.length - 1 && styles.divider,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Poster
                    uri={n.movie?.posterUrl}
                    title={n.movie?.title}
                    w={46}
                    h={69}
                  />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {n.movie ? n.movie.title : "Untitled night"}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {picker !== null ? `${firstNameOf(picker.name)} · ` : ""}
                      {formatShortDate(n.scheduledFor)}
                    </Text>
                  </View>
                  {/* TODO(#40): reaction glyph renders here when present */}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  empty: { ...textPresets.body, color: colors.text.secondary },
  center: { marginTop: space[8], alignSelf: "center" },
  errorText: { ...textPresets.body, color: colors.text.danger },
  // paddingBottom is applied inline from the live tab bar height (the bar is
  // absolutely positioned and would otherwise hide the last row).
  content: { paddingHorizontal: space[5] },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
    borderRadius: radius.lg,
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    marginTop: space[5],
  },
  statCell: { flex: 1, alignItems: "center" },
  statDivider: {
    width: borderWidth.hairline,
    alignSelf: "stretch",
    backgroundColor: colors.border.hairline,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
  },
  divider: {
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  rowPressed: { opacity: pressedOpacity },
  rowText: { flex: 1 },
  rowTitle: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 22,
    color: colors.text.primary,
  },
  rowMeta: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    marginTop: space[1],
  },
});
