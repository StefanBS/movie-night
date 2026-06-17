import { ReactNode } from "react";
import { Pressable, StyleSheet } from "react-native";

import { borderWidth, colors, pressedOpacity, radius, shadow } from "../theme";

// IconButton is a square tappable surface for a single lucide icon (the gear in the
// home bar, calendar chevrons, the add-member plus). The icon element is passed in so
// the caller controls glyph, size, and color.
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 34,
  variant = "card",
}: {
  icon: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  variant?: "card" | "ghost" | "accent";
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size },
        variant === "card" && styles.card,
        variant === "accent" && styles.accent,
        pressed && styles.pressed,
      ]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
  },
  accent: {
    backgroundColor: colors.accent.base,
    ...shadow.spotlight,
  },
  pressed: { opacity: pressedOpacity },
});
