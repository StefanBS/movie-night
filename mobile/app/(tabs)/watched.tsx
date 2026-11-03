import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import {
  Poster,
  SectionLabel,
  TabScrollView,
  TopBar,
} from "../../components";
import { API_URL } from "../../apiUrl";
import { firstName } from "../../lib/avatar";
import { GROUP_ID } from "../../lib/api";
import { formatShortDate } from "../../lib/date";
import { errorMessage } from "../../lib/errors";
import { fetchGroup } from "../../lib/group";
import { buildHistoryMonths, watchedSub } from "../../lib/history";
import { watchedNights } from "../../lib/nightLifecycle";
import { listNights, nightPicker, type Night } from "../../lib/nights";
import { borderWidth, createThemedStyles, fontFamily, fontSize, pressedOpacity, space, tabular, textPresets, useColors } from "../../theme";

export default function WatchedScreen() {
  const colors = useColors();
  const styles = useStyles();
  const router = useRouter();
  const [nights, setNights] = useState<Night[]>([]);
  const [since, setSince] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refetch on focus (not just first mount): a night recorded on another tab
  // must show up when the user returns here, and the tab screen stays mounted.
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      // The group only feeds the "N nights since …" sub, so a failed fetch
      // drops that line and leaves the list alone.
      fetchGroup(API_URL, GROUP_ID, controller.signal).then(
        (g) => setSince(g.createdOn),
        () => {
          if (!controller.signal.aborted) setSince(null);
        },
      );
      (async () => {
        try {
          setNights(watchedNights(await listNights(API_URL, GROUP_ID, controller.signal)));
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
        <TopBar kind="tab" title="Watched" />
        <ActivityIndicator
          style={styles.center}
          size="large"
          color={colors.text.secondary}
        />
      </View>
    );
  }

  if (error !== null) {
    return (
      <View style={styles.screen}>
        <TopBar kind="tab" title="Watched" />
        <View style={styles.body}>
          <Text style={styles.errorText}>{`Couldn't load: ${error}`}</Text>
        </View>
      </View>
    );
  }

  if (nights.length === 0) {
    return (
      <View style={styles.screen}>
        <TopBar kind="tab" title="Watched" />
        <View style={styles.body}>
          <Text style={styles.empty}>No nights yet — start one.</Text>
        </View>
      </View>
    );
  }

  const sub = since !== null ? watchedSub(nights.length, since) : undefined;
  const months = buildHistoryMonths(nights);
  const open = (id: string) =>
    router.push({ pathname: "/night/[id]", params: { id, from: "Watched" } });

  return (
    <View style={styles.screen}>
      <TopBar kind="tab" title="Watched" sub={sub} subTabular />
      <TabScrollView contentContainerStyle={styles.content}>
        {months.map((month, mi) => (
          <View key={month.label}>
            <SectionLabel marginTop={mi === 0 ? FIRST_SECTION_GAP : LATER_SECTION_GAP}>
              {month.label}
            </SectionLabel>
            {month.nights.map((n, i) => {
              const picker = nightPicker(n);
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
                      {picker !== null ? `${firstName(picker.name)} · ` : ""}
                      {formatShortDate(n.scheduledFor)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </TabScrollView>
    </View>
  );
}

// The first month sits 20 below the top bar, later months 28 (24 + 4).
const FIRST_SECTION_GAP = space[5];
const LATER_SECTION_GAP = space[6] + space[1];

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  empty: { ...textPresets.body, color: colors.text.secondary },
  center: { marginTop: space[8], alignSelf: "center" },
  errorText: { ...textPresets.body, color: colors.text.danger },
  content: { paddingHorizontal: space[5] },
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
    fontFamily: fontFamily.serifMedium,
    fontSize: 20,
    lineHeight: 22,
    color: colors.text.primary,
  },
  rowMeta: {
    fontFamily: fontFamily.sans,
    ...tabular,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    marginTop: space[1],
  },
}));
