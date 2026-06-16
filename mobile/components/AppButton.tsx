import { Pressable, StyleSheet, Text } from "react-native";

import {
  borderWidth,
  colors,
  fontFamily,
  pressedOpacity,
  radius,
  shadow,
  space,
  textPresets,
} from "../theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

// AppButton is the Spotlight button. RN's built-in <Button> can't express the
// brand CTA, so screens use this. Logic stays in the screens; presentation only.
//   primary   = ember fill (accent.base) with deep-night ink — the marquee CTA
//   secondary = transparent with a moonlight (accent.cool) outline label
//   ghost     = transparent, ember label, no border — inline secondary action
//   danger    = transparent, red label — destructive action
export function AppButton({
  title,
  onPress,
  disabled = false,
  variant = "primary",
  fullWidth = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: Variant;
  fullWidth?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        styles[variant],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.label, labelStyles[variant]]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: space[3],
    paddingHorizontal: space[5],
    alignItems: "center",
    justifyContent: "center",
  },
  fullWidth: { alignSelf: "stretch" },
  primary: { backgroundColor: colors.accent.base, ...shadow.sm },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.strong,
  },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: "transparent" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: pressedOpacity },
  label: { ...textPresets.body, fontFamily: fontFamily.sansSemibold },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.text.onAccent },
  secondary: { color: colors.accent.cool },
  ghost: { color: colors.accent.strong },
  danger: { color: colors.feedback.danger },
});
