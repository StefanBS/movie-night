import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { CalendarDays } from "lucide-react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { AppButton, TopBar } from "../../components";
import { API_URL } from "../../apiUrl";
import { firstName } from "../../lib/avatar";
import { GROUP_ID } from "../../lib/api";
import { fetchTurn } from "../../lib/turn";
import { createThemedStyles, fontFamily, fontSize, radius, space, textPresets, useColors } from "../../theme";

// Upcoming is a stub for now: the empty state only (the full list of planned
// and repeating nights comes in a later phase). It names whose turn is next so
// the one action has a face; if the turn can't load, the copy drops the name.
export default function UpcomingScreen() {
  const colors = useColors();
  const styles = useStyles();
  const router = useRouter();
  const [next, setNext] = useState<string | null>(null);

  // Refetch on focus: the turn moves when a night is recorded elsewhere, and
  // the tab screen stays mounted.
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      (async () => {
        try {
          const order = await fetchTurn(API_URL, GROUP_ID, controller.signal);
          setNext(order.length > 0 ? firstName(order[0].name) : null);
        } catch {
          // Ignored: the empty state reads fine without a name.
        }
      })();
      return () => controller.abort();
    }, []),
  );

  const lead = next !== null ? `Plan one and ${next} picks the film.` : "Plan one and the next picker chooses the film.";

  return (
    <View style={styles.screen}>
      <TopBar kind="tab" title="Upcoming" sub="Nothing planned yet." />
      <View style={styles.empty}>
        <View style={styles.glyph}>
          <CalendarDays size={26} color={colors.text.secondary} strokeWidth={2} />
        </View>
        <Text style={styles.headline}>No nights on the calendar.</Text>
        <Text style={styles.body}>
          {`${lead} Set it to repeat and the rotation keeps going on its own.`}
        </Text>
        <View style={styles.action}>
          <AppButton title="Plan a night" onPress={() => router.navigate("/night/new")} />
        </View>
      </View>
    </View>
  );
}

const HEADLINE = fontSize.xl;
const GLYPH = 56;

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
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
  action: { marginTop: 6 },
}));
