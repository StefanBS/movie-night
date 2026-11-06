import { StyleSheet, Text, View } from "react-native";

import { borderWidth, createThemedStyles, fontFamily, fontSize, radius, tabular, trackPx } from "../theme";

type Tone = "solid" | "accent" | "neutral";

// Badge is the small sentence-case status pill (Next up, Recorded ✓, Guest).
// `solid` is the filled accent pill, for the picker only; `accent` is the
// tinted one. Never uppercase.
export function Badge({ label, tone = "accent" }: { label: string; tone?: Tone }) {
  const tones = useTones();
  const texts = useTexts();
  return (
    <View style={[styles.base, tones[tone]]}>
      <Text style={[styles.label, texts[tone]]} allowFontScaling={false} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: borderWidth.hairline,
    borderColor: "transparent",
  },
  label: {
    fontFamily: fontFamily.sansBold,
    ...tabular,
    fontSize: fontSize.caption,
    lineHeight: Math.round(fontSize.caption * 1.2),
    letterSpacing: trackPx(fontSize.caption, "caption"),
  },
});

const useTones = createThemedStyles((colors) => ({
  solid: { backgroundColor: colors.accent.base },
  accent: { backgroundColor: colors.surface.spotlight },
  neutral: { backgroundColor: colors.surface.subtle },
}));

const useTexts = createThemedStyles((colors) => ({
  solid: { color: colors.text.onAccent },
  accent: { color: colors.accent.strong },
  neutral: { color: colors.text.secondary },
}));
