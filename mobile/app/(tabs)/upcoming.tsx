import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { CalendarDays, ChevronRight } from "lucide-react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { AppButton, Avatar, SectionLabel, TabScrollView, TopBar } from "../../components";
import { API_URL } from "../../apiUrl";
import { firstName } from "../../lib/avatar";
import { GROUP_ID } from "../../lib/api";
import { todayLocalISO, weekday } from "../../lib/date";
import { errorMessage } from "../../lib/errors";
import { upcomingNights } from "../../lib/nightLifecycle";
import { listNights, type Night } from "../../lib/nights";
import { fetchTurn } from "../../lib/turn";
import { upcomingMeta, upcomingPicker, upcomingSub, upcomingTitle } from "../../lib/upcoming";
import {
  borderWidth,
  createThemedStyles,
  fontFamily,
  fontSize,
  pressedOpacity,
  radius,
  space,
  tabular,
  textPresets,
  trackPx,
  useColors,
} from "../../theme";

// Upcoming lists every Night on the calendar, soonest first under "Next", the
// rest under "Later". The one action is "Plan a night", which (besides
// Tonight) is the only way into the new-night flow. Repeating series come with
// #180.
export default function UpcomingScreen() {
  const colors = useColors();
  const styles = useStyles();
  const router = useRouter();
  const [nights, setNights] = useState<Night[]>([]);
  const [nextPicker, setNextPicker] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refetch on focus: a night planned or recorded elsewhere must show up here,
  // and the tab screen stays mounted. The nights are what the screen is for, so
  // their failure is the screen's error; the turn only names the empty state's
  // picker, so it degrades to no name.
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      (async () => {
        try {
          const [all, order] = await Promise.all([
            listNights(API_URL, GROUP_ID, controller.signal),
            fetchTurn(API_URL, GROUP_ID, controller.signal).catch(() => []),
          ]);
          setNights(upcomingNights(all, todayLocalISO()));
          setNextPicker(order.length > 0 ? firstName(order[0].name) : null);
          setError(null);
        } catch (e) {
          if (!controller.signal.aborted) {
            setError(errorMessage(e, "failed to load the calendar"));
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

  const plan = () => router.navigate("/night/new");

  if (loading) {
    return (
      <View style={styles.screen}>
        <TopBar kind="tab" title="Upcoming" />
        <ActivityIndicator style={styles.center} size="large" color={colors.text.secondary} />
      </View>
    );
  }

  if (error !== null) {
    return (
      <View style={styles.screen}>
        <TopBar kind="tab" title="Upcoming" />
        <Text style={styles.error}>{`Couldn't load: ${error}`}</Text>
      </View>
    );
  }

  const [next, ...later] = nights;
  const sub = upcomingSub(next ?? null);

  if (next === undefined) {
    const lead =
      nextPicker !== null ? `Plan one and ${nextPicker} picks the film.` : "Plan one and the next picker chooses the film.";
    return (
      <View style={styles.screen}>
        <TopBar kind="tab" title="Upcoming" sub={sub} />
        <View style={styles.empty}>
          <View style={styles.glyph}>
            <CalendarDays size={26} color={colors.text.secondary} strokeWidth={2} />
          </View>
          <Text style={styles.headline}>No nights on the calendar.</Text>
          <Text style={styles.body}>
            {`${lead} Set it to repeat and the rotation keeps going on its own.`}
          </Text>
          <View style={styles.emptyAction}>
            <AppButton title="Plan a night" onPress={plan} />
          </View>
        </View>
      </View>
    );
  }

  const open = (id: string) => router.push({ pathname: "/night/[id]", params: { id, from: "Upcoming" } });

  return (
    <View style={styles.screen}>
      <TopBar kind="tab" title="Upcoming" sub={sub} />
      <TabScrollView contentContainerStyle={styles.content}>
        <SectionLabel>Next</SectionLabel>
        <UpcomingRow night={next} last onPress={() => open(next.id)} />
        {later.length > 0 ? (
          <>
            <SectionLabel>Later</SectionLabel>
            {later.map((n, i) => (
              <UpcomingRow key={n.id} night={n} last={i === later.length - 1} onPress={() => open(n.id)} />
            ))}
          </>
        ) : null}
        <View style={styles.action}>
          <AppButton title="Plan a night" onPress={plan} />
        </View>
      </TabScrollView>
    </View>
  );
}

// UpcomingRow is one Night: a date block, the date and time, who picks (the
// accent dot marks the picker) and how many are coming, then the picker's
// avatar.
function UpcomingRow({ night, last, onPress }: { night: Night; last: boolean; onPress: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const picker = upcomingPicker(night);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}
    >
      <View style={styles.dateBlock}>
        <Text style={styles.dateWeekday} allowFontScaling={false}>
          {weekday(night.scheduledFor)}
        </Text>
        <Text style={styles.dateDay} allowFontScaling={false}>
          {Number(night.scheduledFor.split("-")[2])}
        </Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {upcomingTitle(night)}
        </Text>
        <View style={styles.metaRow}>
          {picker !== null ? <View style={styles.dot} /> : null}
          <Text style={styles.rowMeta} numberOfLines={1}>
            {upcomingMeta(night)}
          </Text>
        </View>
      </View>
      {picker !== null ? <Avatar name={picker.name} size={28} /> : null}
      <ChevronRight size={18} color={colors.text.tertiary} strokeWidth={2} />
    </Pressable>
  );
}

const HEADLINE = fontSize.xl;
const GLYPH = 56;
const DATE_BLOCK = 48;
const DAY = 22;
const DOT = 8;

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  center: { marginTop: space[8], alignSelf: "center" },
  error: { ...textPresets.body, color: colors.text.danger, paddingHorizontal: space[5], paddingTop: space[6] },
  content: { paddingHorizontal: space[5] },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: space[3] },
  divider: { borderBottomWidth: borderWidth.hairline, borderBottomColor: colors.border.hairline },
  pressed: { opacity: pressedOpacity },
  dateBlock: {
    width: DATE_BLOCK,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surface.card,
  },
  dateWeekday: { fontFamily: fontFamily.sansBold, fontSize: fontSize.caption, color: colors.text.secondary },
  dateDay: {
    fontFamily: fontFamily.display,
    ...tabular,
    fontSize: DAY,
    lineHeight: Math.round(DAY * 1.05),
    letterSpacing: trackPx(DAY, "title"),
    color: colors.text.primary,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.base, color: colors.text.primary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  dot: { width: DOT, height: DOT, borderRadius: radius.full, backgroundColor: colors.accent.base },
  rowMeta: { ...textPresets.barMeta, ...tabular, color: colors.text.tertiary, flexShrink: 1 },
  action: { marginTop: 22, alignItems: "flex-start" },
  empty: {
    paddingHorizontal: space[5],
    marginTop: space[16],
    alignItems: "flex-start",
    gap: 14,
  },
  glyph: {
    width: GLYPH,
    height: GLYPH,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface.subtle,
  },
  headline: {
    fontFamily: fontFamily.display,
    fontSize: HEADLINE,
    lineHeight: Math.round(HEADLINE * 1.15),
    letterSpacing: HEADLINE * -0.025,
    color: colors.text.primary,
  },
  body: { ...textPresets.body, color: colors.text.secondary, maxWidth: 300 },
  emptyAction: { marginTop: 6 },
}));
