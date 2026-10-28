import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Calendar } from "../";
import { StartTimeRow } from "./StartTimeRow";
import { Stepper } from "./Stepper";
import { WizardFooter } from "./WizardFooter";
import { shiftMonth, yearMonthOf, type YearMonth } from "../../lib/calendar";
import { relativeLabel } from "../../lib/date";
import { nightWording } from "../../lib/nightLifecycle";
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

// WhenStep is the wizard's first step: a "Tonight" chip + the Calendar and an
// optional start time, with a sticky footer that names the plan
// (PLANNING/TONIGHT/RECORDING) and its relative date. It owns its own selection/month —
// it reports the chosen date and start time on "Next". `initial` and
// `initialStartTime` restore them when the user comes back.
export function WhenStep({
  today,
  initial = today,
  initialStartTime = null,
  nightDates,
  busy,
  onNext,
}: {
  today: string;
  initial?: string;
  initialStartTime?: string | null;
  nightDates: Set<string>;
  busy: string | null;
  onNext: (iso: string, startTime: string | null) => void;
}) {
  const [selected, setSelected] = useState(initial);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [month, setMonth] = useState<YearMonth>(() => yearMonthOf(initial));
  const isToday = selected === today;
  const wording = nightWording(selected, today);

  const pickToday = () => {
    setSelected(today);
    setMonth(yearMonthOf(today));
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

        <View style={styles.timeCard}>
          <StartTimeRow startTime={startTime} onChange={setStartTime} disabled={busy !== null} />
        </View>
      </ScrollView>

      <WizardFooter>
        <View style={styles.footerMeta}>
          <Text style={styles.planTag} allowFontScaling={false}>
            {wording.planTag}
          </Text>
          <Text style={styles.relLabel} allowFontScaling={false}>
            {relativeLabel(selected, today)}
          </Text>
        </View>
        <AppButton
          title="Next: who's coming  →"
          fullWidth
          disabled={busy !== null}
          onPress={() => onNext(selected, startTime)}
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
  timeCard: {
    marginTop: space[3],
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  footerMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planTag: { ...textPresets.tag, color: colors.text.tertiary },
  relLabel: { fontFamily: fontFamily.sansSemibold, fontSize: fontSize.sm, color: colors.accent.strong },
});
