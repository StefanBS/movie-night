import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Calendar } from "../";
import { Stepper } from "./Stepper";
import { WizardFooter } from "./WizardFooter";
import { shiftMonth, type YearMonth } from "../../lib/calendar";
import { daysUntil, relativeLabel } from "../../lib/date";
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

// WhenStep is the wizard's first step: a "Tonight" chip + the Calendar, with a
// sticky footer that names the plan (TONIGHT/PLANNING) and its relative date. It
// owns its own selection/month — it is just a date picker that reports the chosen
// date on "Next".
export function WhenStep({
  today,
  nightDates,
  busy,
  onNext,
}: {
  today: string;
  nightDates: Set<string>;
  busy: string | null;
  onNext: (iso: string) => void;
}) {
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState<YearMonth>(() => {
    const [year, m] = today.split("-").map(Number);
    return { year, month: m };
  });
  const isToday = selected === today;
  const future = daysUntil(selected, today) > 0;

  const pickToday = () => {
    setSelected(today);
    const [year, m] = today.split("-").map(Number);
    setMonth({ year, month: m });
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <Stepper current={0} />
        <Text style={styles.heading}>{"When's the night?"}</Text>
        <Text style={styles.hint}>
          {"Tonight, or pick any date to plan ahead. We'll remind everyone."}
        </Text>

        <View style={styles.chips}>
          <Pressable
            onPress={pickToday}
            style={({ pressed }) => [
              styles.chip,
              isToday ? styles.chipOn : styles.chipOff,
              pressed && styles.chipPressed,
            ]}
          >
            <Text
              style={[styles.chipText, isToday && styles.chipTextOn]}
              allowFontScaling={false}
            >
              Tonight
            </Text>
          </Pressable>
        </View>

        <View style={styles.calendarCard}>
          <Calendar
            value={selected}
            today={today}
            month={month}
            nightDates={nightDates}
            onPick={setSelected}
            onMonth={(dir) => setMonth((m) => shiftMonth(m, dir))}
          />
        </View>
      </ScrollView>

      <WizardFooter>
        <View style={styles.footerMeta}>
          <Text style={styles.planTag} allowFontScaling={false}>
            {future ? "PLANNING" : "TONIGHT"}
          </Text>
          <Text style={styles.relLabel} allowFontScaling={false}>
            {relativeLabel(selected, today)}
          </Text>
        </View>
        <AppButton
          title="Next: who's coming  →"
          fullWidth
          disabled={busy !== null}
          onPress={() => onNext(selected)}
        />
      </WizardFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: space[6] },
  heading: { ...textPresets.screenTitle, color: colors.text.primary, marginTop: space[4] },
  hint: { ...textPresets.meta, color: colors.text.secondary, marginTop: space[2] },
  chips: { flexDirection: "row", gap: space[2], marginTop: space[4] },
  chip: { paddingVertical: space[2], paddingHorizontal: space[4], borderRadius: radius.full },
  chipOn: { backgroundColor: colors.accent.base },
  chipOff: {
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
  },
  chipPressed: { opacity: pressedOpacity },
  chipText: { fontFamily: fontFamily.sansSemibold, fontSize: fontSize.sm, color: colors.text.secondary },
  chipTextOn: { color: colors.text.onAccent },
  calendarCard: {
    marginTop: space[4],
    padding: space[4],
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
    borderRadius: radius.lg,
  },
  footerMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planTag: { ...textPresets.tag, color: colors.text.tertiary },
  relLabel: { fontFamily: fontFamily.sansSemibold, fontSize: fontSize.sm, color: colors.accent.strong },
});
