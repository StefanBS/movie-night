import { ReactNode } from "react";
import { Text, View } from "react-native";

import { createThemedStyles, radius, space, textPresets } from "../theme";

// Banner is the inline message strip for screen-level hints (the fairness note
// on The order) and errors: a borderless tinted fill. `icon` is an optional
// lucide element supplied by the caller.
export function Banner({
  children,
  tone = "info",
  icon,
}: {
  children: string;
  tone?: "info" | "danger";
  icon?: ReactNode;
}) {
  const styles = useStyles();
  const danger = tone === "danger";
  return (
    <View
      style={[styles.base, danger ? styles.danger : styles.info]}
      accessibilityRole={danger ? "alert" : "text"}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[styles.text, danger && styles.dangerText]}>{children}</Text>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  base: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
  },
  info: { backgroundColor: colors.surface.subtle },
  danger: { backgroundColor: colors.surface.danger },
  icon: { flexShrink: 0 },
  text: { ...textPresets.meta, color: colors.text.secondary, flex: 1 },
  dangerText: { color: colors.text.danger },
}));
