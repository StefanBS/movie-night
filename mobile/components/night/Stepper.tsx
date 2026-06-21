import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, fontFamily, radius, space, textPresets } from "../../theme";

const STEP_LABELS = ["When", "Here", "Pick", "Done"] as const;

// Stepper is the wizard's four-dot progress rail (When · Here · Pick · Done).
// Dots before the current step show a check; the current dot is ember; the rest
// are muted.
export function Stepper({ current }: { current: number }) {
  return (
    <View style={styles.stepper}>
      {STEP_LABELS.map((label, i) => {
        const on = i === current;
        const done = i < current;
        return (
          <Fragment key={label}>
            {i > 0 ? (
              <View style={[styles.stepBar, done && styles.stepBarDone]} />
            ) : null}
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, (on || done) && styles.stepDotActive]}>
                <Text
                  style={[styles.stepDotText, (on || done) && styles.stepDotTextActive]}
                  allowFontScaling={false}
                >
                  {done ? "✓" : String(i + 1)}
                </Text>
              </View>
              <Text
                style={[styles.stepLabel, on && styles.stepLabelActive]}
                allowFontScaling={false}
              >
                {label}
              </Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[2] },
  stepItem: { flexDirection: "row", alignItems: "center", gap: space[1] },
  stepBar: { flex: 1, height: 1, backgroundColor: colors.border.hairline },
  stepBarDone: { backgroundColor: colors.accent.base },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface.subtle,
  },
  stepDotActive: { backgroundColor: colors.accent.base },
  stepDotText: { fontFamily: fontFamily.monoBold, fontSize: 10, color: colors.text.tertiary },
  stepDotTextActive: { color: colors.text.onAccent },
  stepLabel: { ...textPresets.tag, color: colors.text.tertiary },
  stepLabelActive: { color: colors.accent.strong },
});
