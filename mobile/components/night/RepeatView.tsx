import { Pressable, ScrollView, Text, View } from "react-native";

import { AppButton, SectionLabel, TopBar } from "../";
import { AttendCheck } from "./AttendCheck";
import { WizardFooter } from "./WizardFooter";
import { countdownLabel, formatWeekdayDate } from "../../lib/date";
import { repeatOptions, sameRepeat, seriesDates, type Repeat } from "../../lib/repeat";
import { borderWidth, createThemedStyles, fontFamily, fontSize, lh, pressedOpacity, radius, space, tabular, textPresets, trackPx } from "../../theme";

// RepeatView is the Edit screen's Repeat step (ADR-0014): how often the night
// repeats, and a preview of the dates that gives. It edits the Edit draft, so
// a change saves with "Save changes" and is discarded with it. The preview is
// a projection: the next Night opens once this one is recorded or cancelled.
export function RepeatView({
  date,
  today,
  repeat,
  onChange,
  onDone,
}: {
  date: string;
  today: string;
  repeat: Repeat | null;
  onChange: (next: Repeat | null) => void;
  onDone: () => void;
}) {
  const styles = useStyles();
  const options = repeatOptions(date, repeat);
  const preview = seriesDates(repeat, date, 4);
  return (
    <View style={styles.screen}>
      <TopBar kind="title" title="Repeat" back={{ label: "Edit", onPress: onDone }} />
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>
            Keep movie night on a cadence. The rotation rolls forward each time, so the next picker is always ready.
          </Text>

          <SectionLabel>How often</SectionLabel>
          <View style={styles.options}>
            {options.map((o) => {
              const selected = sameRepeat(o.repeat, repeat);
              return (
                <Pressable
                  key={o.id}
                  onPress={() => onChange(o.repeat)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
                >
                  <View style={styles.optionText}>
                    <Text style={styles.optionLabel}>{o.label}</Text>
                    <Text style={styles.optionNote}>{o.note}</Text>
                  </View>
                  <AttendCheck on={selected} size={22} />
                </Pressable>
              );
            })}
          </View>

          <SectionLabel>Up next</SectionLabel>
          <View>
            {preview.map((d, i) => (
              <View key={d} style={[styles.dateRow, i < preview.length - 1 && styles.divider]}>
                <Text style={[styles.date, i === 0 && styles.dateFirst]} numberOfLines={1}>
                  {formatWeekdayDate(d)}
                </Text>
                <Text style={styles.countdown}>{countdownLabel(d, today)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
        <WizardFooter>
          <AppButton title="Done" fullWidth onPress={onDone} />
        </WizardFooter>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  flex: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingTop: space[2], paddingBottom: space[6] },
  intro: { ...textPresets.body, color: colors.text.secondary, marginTop: space[2] },
  options: { gap: space[2] },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: 14,
    paddingHorizontal: space[4],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.ring,
    borderColor: "transparent",
  },
  optionSelected: { borderColor: colors.text.primary },
  pressed: { opacity: pressedOpacity },
  optionText: { flex: 1 },
  optionLabel: { ...textPresets.body, fontFamily: fontFamily.sansSemibold, color: colors.text.primary },
  optionNote: { ...textPresets.meta, fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  dateRow: { flexDirection: "row", alignItems: "baseline", gap: space[3], paddingVertical: 11 },
  divider: { borderBottomWidth: borderWidth.hairline, borderBottomColor: colors.border.hairline },
  date: {
    flex: 1,
    // No tabular figures: they widen the comma ("Sunday , Nov 1").
    fontFamily: fontFamily.sansMedium,
    fontSize: 17,
    lineHeight: lh(17, "snug"),
    color: colors.text.primary,
  },
  dateFirst: { fontFamily: fontFamily.display, letterSpacing: trackPx(17, "title") },
  countdown: { fontFamily: fontFamily.sans, ...tabular, fontSize: fontSize.caption, color: colors.text.tertiary },
}));
