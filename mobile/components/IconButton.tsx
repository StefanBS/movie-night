import { ReactNode } from "react";
import { Pressable } from "react-native";

import { createThemedStyles, pressedOpacity, radius } from "../theme";

const SIZES = { sm: 32, md: 40 } as const;

// IconButton is a round, borderless tap target for a single lucide icon (the
// gear in the home bar, calendar chevrons, the add-member plus). The icon
// element is passed in so the caller controls glyph, size and colour (usually
// text.secondary, 2px stroke). `filled` gives it a subtle surface, for top-bar
// actions.
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = "md",
  filled = false,
}: {
  icon: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  size?: keyof typeof SIZES;
  filled?: boolean;
}) {
  const styles = useStyles();
  const dim = SIZES[size];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.base,
        { width: dim, height: dim },
        filled && styles.filled,
        pressed && styles.pressed,
      ]}
    >
      {icon}
    </Pressable>
  );
}

const useStyles = createThemedStyles((colors) => ({
  base: {
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  filled: { backgroundColor: colors.surface.subtle },
  pressed: { opacity: pressedOpacity },
}));
