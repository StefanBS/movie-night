import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, space, textPresets } from "../theme";

// Banner is the info/fairness strip (The order) and the danger note. `icon` is an
// optional lucide element supplied by the caller.
export function Banner({
  children,
  tone = "info",
  icon,
}: {
  children: string;
  tone?: "info" | "danger";
  icon?: ReactNode;
}) {
  const danger = tone === "danger";
  return (
    <View style={[styles.base, danger ? styles.danger : styles.info]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[styles.text, danger && styles.dangerText]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    padding: space[4],
    borderRadius: radius.lg,
  },
  info: { backgroundColor: colors.surface.subtle },
  danger: { backgroundColor: colors.surface.danger },
  icon: { flexShrink: 0 },
  text: { ...textPresets.meta, color: colors.text.secondary, flex: 1 },
  dangerText: { color: colors.feedback.danger },
});
