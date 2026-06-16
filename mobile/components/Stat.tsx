import { StyleSheet, Text, View } from "react-native";

import { colors, fontFamily, fontSize, space, trackPx } from "../theme";

// Stat is a ticket-stub metric: mono value over a mono uppercase caption.
// `accent` turns the value ember (the "Loved" count, "in line" rank).
export function Stat({
  value,
  label,
  accent = false,
}: {
  value: string | number;
  label: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.base}>
      <Text style={[styles.value, accent && styles.accent]} allowFontScaling={false}>
        {value}
      </Text>
      <Text style={styles.label} allowFontScaling={false}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { gap: space[1] },
  value: {
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.xl,
    color: colors.text.primary,
    letterSpacing: -0.22,
  },
  accent: { color: colors.accent.strong },
  label: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    color: colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: trackPx(fontSize.caption, "caption"),
  },
});
