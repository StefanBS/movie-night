import { Text, View } from "react-native";

import { createThemedStyles, fontFamily, fontSize, tabular, textPresets, trackPx } from "../theme";

// Stat is a metric: a big tabular number over a small sentence-case label.
// `accent` turns the value terracotta (the "In line" rank on a member's page).
export function Stat({
  value,
  label,
  accent = false,
}: {
  value: string | number;
  label: string;
  accent?: boolean;
}) {
  const styles = useStyles();
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

const useStyles = createThemedStyles((colors) => ({
  base: { gap: 2 },
  value: {
    fontFamily: fontFamily.display,
    ...tabular,
    fontSize: fontSize["2xl"],
    lineHeight: fontSize["2xl"] + 2,
    letterSpacing: trackPx(fontSize["2xl"], "title"),
    color: colors.text.primary,
  },
  accent: { color: colors.accent.strong },
  label: { ...textPresets.meta, color: colors.text.secondary },
}));
