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

// AppButton is the Spotlight button. RN's built-in <Button> can't express the
// brand CTA (its single `color` prop means "text on iOS, fill on Android"), so
// the screens use this instead.
//   primary   = ember fill (accent.base) with deep-night ink — the marquee CTA
//   secondary = transparent with a moonlight (accent.cool) label
// Logic stays in the screens; this is presentation only.
export function AppButton({
  title,
  onPress,
  disabled = false,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={isPrimary ? styles.primaryLabel : styles.secondaryLabel}>
        {title}
      </Text>
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
  primary: {
    backgroundColor: colors.accent.base, // the ember fill
    ...shadow.sm,
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.strong,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: pressedOpacity },
  primaryLabel: {
    ...textPresets.body,
    fontFamily: fontFamily.sansSemibold,
    color: colors.text.onAccent, // deep-night ink on the ember
  },
  secondaryLabel: {
    ...textPresets.body,
    fontFamily: fontFamily.sansSemibold,
    color: colors.accent.cool, // moonlight
  },
});
