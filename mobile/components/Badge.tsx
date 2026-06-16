import { StyleSheet, Text, View } from "react-native";

import { colors, fontFamily, fontSize, radius, space, trackPx } from "../theme";

type Tone = "solid" | "ember" | "neutral" | "muted" | "danger";

// Badge is the mono ticket-stub status tag (NEXT UP, CORE, RECORDED ✓, Guest, OUT).
// Uppercase mono is the app's only uppercase. `solid` is the filled ember pill.
export function Badge({
  label,
  tone = "ember",
  uppercase = true,
}: {
  label: string;
  tone?: Tone;
  uppercase?: boolean;
}) {
  return (
    <View style={[styles.base, fills[tone]]}>
      <Text
        style={[styles.label, texts[tone], uppercase && styles.uppercase]}
        allowFontScaling={false}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: radius.full,
  },
  label: {
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.caption,
    letterSpacing: trackPx(fontSize.caption, "caption"),
  },
  uppercase: { textTransform: "uppercase" },
});

const fills = StyleSheet.create({
  solid: { backgroundColor: colors.accent.base },
  ember: { backgroundColor: colors.surface.spotlight },
  neutral: { backgroundColor: colors.surface.subtle },
  muted: { backgroundColor: "transparent" },
  danger: { backgroundColor: colors.surface.danger },
});

const texts = StyleSheet.create({
  solid: { color: colors.text.onAccent },
  ember: { color: colors.accent.strong },
  neutral: { color: colors.text.secondary },
  muted: { color: colors.text.tertiary },
  danger: { color: colors.feedback.danger },
});
