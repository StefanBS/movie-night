import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import {
  Poster,
  SectionLabel,
  TabScrollView,
  TopBar,
} from "../../components";
import { useLoad } from "../../components/useLoad";
import { API_URL } from "../../apiUrl";
import { firstName } from "../../lib/avatar";
import { GROUP_ID } from "../../lib/api";
import { formatShortDate } from "../../lib/date";
import { fetchGroup } from "../../lib/group";
import { buildHistory, watchedSub } from "../../lib/history";
import { watchedNights } from "../../lib/nightLifecycle";
import { listNights, nightPicker, type Night } from "../../lib/nights";
import { borderWidth, createThemedStyles, fontFamily, fontSize, pressedOpacity, space, tabular, textPresets, useColors } from "../../theme";

export default function WatchedScreen() {
  const colors = useColors();
  const styles = useStyles();
  const router = useRouter();
  // Refetch on focus (useLoad's default): a night recorded on another tab must
  // show up when the user returns here, and the tab screen stays mounted. The
  // group only feeds the "N nights since …" sub, so a failed group fetch drops
  // that line and leaves the list alone.
  const {
    data: { nights, since },
    loading,
    error,
  } = useLoad(
    async (signal) => {
      const [all, since] = await Promise.all([
        listNights(API_URL, GROUP_ID, signal),
        fetchGroup(API_URL, GROUP_ID, signal).then(
          (g): string | null => g.createdOn,
          () => null,
        ),
      ]);
      return { nights: watchedNights(all), since };
    },
    { nights: [] as Night[], since: null as string | null },
    "failed to load history",
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
  const sections = buildHistory(nights);
  const open = (id: string) =>
    router.push({ pathname: "/night/[id]", params: { id, from: "Watched" } });

  return (
    <View style={styles.screen}>
      <TopBar kind="tab" title="Watched" sub={sub} subTabular />
      <TabScrollView contentContainerStyle={styles.content}>
        {sections.map((section) => (
          <View key={section.label ?? "this-year"}>
            {section.label !== null && (
              <SectionLabel>{section.label}</SectionLabel>
            )}
            {section.nights.map((n, i) => {
              const picker = nightPicker(n);
              return (
                <Pressable
                  key={n.id}
                  onPress={() => open(n.id)}
                  style={({ pressed }) => [
                    styles.row,
                    i < section.nights.length - 1 && styles.divider,
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
                      {`${firstName(picker.name)} · `}
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

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  empty: { ...textPresets.body, color: colors.text.secondary },
  center: { marginTop: space[8], alignSelf: "center" },
  errorText: { ...textPresets.body, color: colors.text.danger },
  // One continuous list, 12 under the title block; an earlier year's label
  // sits 24 above its first row.
  content: { paddingHorizontal: space[5], paddingTop: space[3] },
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
