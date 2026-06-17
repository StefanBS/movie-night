import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";

import { Avatar, Badge, Poster, SectionLabel, TopBar } from "../../components";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { formatShortDate } from "../../lib/date";
import { errorMessage } from "../../lib/errors";
import { getNightOrNull, type Night } from "../../lib/nights";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
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

// NightDetail is the editorial body once a night has loaded: poster + title hero,
// the picker spotlight, and the who-watched roster. It mirrors the night flow's
// RecordedStep vocabulary (not shared code — the two screens evolve separately).
function NightDetail({ night }: { night: Night }) {
  const movie = night.movie;
  const picker = night.attendees.find((a) => a.id === night.pickerId) ?? null;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Poster
          uri={movie?.posterUrl}
          title={movie?.title}
          year={movie?.releaseYear ?? undefined}
          w={132}
          h={196}
        />
        <Text style={styles.title} numberOfLines={4}>
          {movie ? movie.title : "Untitled night"}
        </Text>
        {movie?.releaseYear != null ? (
          <Text style={styles.year}>{movie.releaseYear}</Text>
        ) : null}
        {/* TODO(#40): reaction glyph renders here when present */}
      </View>

      <SectionLabel>The pick</SectionLabel>
      {picker !== null ? (
        <View style={styles.pickCard}>
          <Avatar name={picker.name} size={44} glow />
          <View style={styles.pickText}>
            <Text style={styles.pickName} numberOfLines={1}>
              {picker.name}
            </Text>
            <Text style={styles.pickDate}>{formatShortDate(night.scheduledFor)}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.muted}>No pick recorded.</Text>
      )}

      <SectionLabel>Who watched</SectionLabel>
      <View>
        {night.attendees.map((a, i) => (
          <View
            key={a.id}
            style={[
              styles.watchRow,
              i < night.attendees.length - 1 && styles.divider,
            ]}
          >
            <Avatar name={a.name} size={36} />
            <Text style={styles.watchName} numberOfLines={1}>
              {a.name}
            </Text>
            {a.role === "guest" ? <Badge label="Guest" tone="neutral" /> : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export default function NightDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [night, setNight] = useState<Night | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      (async () => {
        try {
          setLoading(true);
          const n = await getNightOrNull(API_URL, GROUP_ID, id, controller.signal);
          setNight(n);
          setError(null);
        } catch (e) {
          if (!controller.signal.aborted) {
            setError(errorMessage(e, "failed to load night"));
          }
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        }
      })();
      return () => controller.abort();
    }, [id]),
  );

  return (
    <View style={styles.screen}>
      <TopBar
        kind="title"
        title="Night"
        back={{ label: "History", onPress: () => router.back() }}
      />
      {loading ? (
        <ActivityIndicator
          style={styles.center}
          size="large"
          color={colors.accent.base}
        />
      ) : error !== null ? (
        <Text style={[styles.center, styles.error]}>
          {`Couldn't load night: ${error}`}
        </Text>
      ) : night === null ? (
        <View style={styles.body}>
          <Text style={styles.muted}>{"Couldn't find that night."}</Text>
        </View>
      ) : (
        <NightDetail night={night} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  center: { flex: 1, textAlignVertical: "center", textAlign: "center", paddingHorizontal: space[5] },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  error: { ...textPresets.body, color: colors.text.danger },
  muted: { ...textPresets.body, color: colors.text.secondary },
  content: { paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: space[10] },
  header: { alignItems: "center", paddingTop: space[3], paddingBottom: space[4] },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: trackPx(34, "display"),
    color: colors.text.primary,
    marginTop: space[4],
    textAlign: "center",
  },
  year: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginTop: space[2],
  },
  pickCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    backgroundColor: colors.surface.spotlight,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.accent.base,
    ...shadow.spotlight,
  },
  pickText: { flex: 1 },
  pickName: { ...textPresets.rowName, color: colors.text.primary },
  pickDate: { ...textPresets.tag, color: colors.text.secondary, marginTop: space[1] },
  watchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
  },
  divider: {
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  watchName: { ...textPresets.rowName, color: colors.text.primary, flex: 1 },
});
