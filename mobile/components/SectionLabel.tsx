import { StyleSheet, Text } from "react-native";

import { colors, fontFamily, fontSize, space, trackPx } from "../theme";

// SectionLabel is the mono uppercase group heading (the app's only uppercase outside badges).
export function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={styles.label} allowFontScaling={false}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: trackPx(fontSize.caption, "caption"),
    marginTop: space[5],
    marginBottom: space[2],
  },
});
