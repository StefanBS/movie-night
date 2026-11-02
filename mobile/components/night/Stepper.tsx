import { Text, View } from "react-native";

import { createThemedStyles, fontFamily, lh, space } from "../../theme";

const STEP_LABELS = ["When", "Here", "Pick", "Done"] as const;

// Stepper is the wizard's progress: four segments with sentence-case labels
// (When · Here · Pick · Done). Done segments are solid text colour, the current
// one the accent, the rest a strong hairline.
export function Stepper({ current }: { current: number }) {
  const styles = useStyles();
  return (
    <View
      style={styles.stepper}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: STEP_LABELS.length, now: current + 1 }}
    >
      {STEP_LABELS.map((label, i) => {
        const on = i === current;
        const done = i < current;
        return (
          <View key={label} style={styles.step}>
            <View style={[styles.bar, on ? styles.barOn : done ? styles.barDone : null]} />
            <Text
              style={[styles.label, (on || done) && styles.labelReached, on && styles.labelOn]}
              allowFontScaling={false}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  stepper: { flexDirection: "row", gap: 6, marginTop: space[2] },
  step: { flex: 1, minWidth: 0, gap: space[2] },
  bar: { height: 3, borderRadius: 2, backgroundColor: colors.border.strong },
  barOn: { backgroundColor: colors.accent.base },
  barDone: { backgroundColor: colors.text.primary },
  label: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 13,
    lineHeight: lh(13),
    color: colors.text.tertiary,
  },
  labelReached: { color: colors.text.primary },
  labelOn: { fontFamily: fontFamily.sansBold },
}));
