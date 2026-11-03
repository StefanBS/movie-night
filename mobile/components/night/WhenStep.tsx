import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { AppButton, Calendar } from "../";
import { StartTimeRow } from "./StartTimeRow";
import { Stepper } from "./Stepper";
import { WizardFooter } from "./WizardFooter";
import { shiftMonth, yearMonthOf, type YearMonth } from "../../lib/calendar";
import { nightSummary } from "../../lib/date";
import { createThemedStyles, fontFamily, fontSize, pressedOpacity, radius, space, textPresets } from "../../theme";

// WhenStep is the wizard's first step: a "Tonight" chip + the Calendar and an
// optional start time, with a sticky footer that sums up the choice in one
// line ("Friday, Jun 19 · 8:00 PM · in 4 days", lib/date nightSummary). It owns its own selection/month —
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
  const styles = useStyles();
  const [selected, setSelected] = useState(initial);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [month, setMonth] = useState<YearMonth>(() => yearMonthOf(initial));
  const isToday = selected === today;
  const [summaryDate, ...summaryRest] = nightSummary(selected, startTime, today);

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
        <Text style={styles.summary} allowFontScaling={false}>
          <Text style={styles.summaryDate}>{summaryDate}</Text>
          {summaryRest.map((part) => ` · ${part}`).join("")}
        </Text>
        <AppButton
          title="Next: who's coming →"
          fullWidth
          disabled={busy !== null}
          onPress={() => onNext(selected, startTime)}
        />
      </WizardFooter>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  flex: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: space[6] },
  heading: { ...textPresets.screenTitle, color: colors.text.primary, marginTop: space[4] },
  hint: { ...textPresets.meta, color: colors.text.secondary, marginTop: space[2] },
  chips: { flexDirection: "row", gap: space[2], marginTop: space[4] },
  chip: { paddingVertical: space[2], paddingHorizontal: space[4], borderRadius: radius.full },
  chipOn: { backgroundColor: colors.text.primary },
  chipOff: { backgroundColor: colors.surface.subtle },
  chipPressed: { opacity: pressedOpacity },
  chipText: { fontFamily: fontFamily.sansSemibold, fontSize: fontSize.sm, color: colors.text.primary },
  chipTextOn: { color: colors.surface.page },
  // Cards sit on the page by fill alone, as on the board: no hairline edge.
  calendarCard: {
    marginTop: space[4],
    padding: space[4],
    backgroundColor: colors.surface.card,
    borderRadius: radius.lg,
  },
  timeCard: {
    marginTop: space[3],
    backgroundColor: colors.surface.card,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  // No `tabular`: Schibsted's tabular figures widen the comma ("Friday , Nov 13").
  summary: { ...textPresets.meta, color: colors.text.secondary },
  summaryDate: { fontFamily: fontFamily.sansBold, color: colors.text.primary },
}));
