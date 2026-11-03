import { Text, View } from "react-native";

import { createThemedStyles, fontFamily, fontSize, tabular, textPresets, trackPx } from "../theme";

// Stat is a metric: a big tabular number over a small sentence-case label.
export function Stat({ value, label }: { value: string | number; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.base}>
      <Text style={styles.value} allowFontScaling={false}>
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
  label: { ...textPresets.meta, color: colors.text.secondary },
}));
