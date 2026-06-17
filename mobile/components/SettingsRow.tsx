import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  colors,
  fontFamily,
  fontSize,
  pressedOpacity,
  radius,
  space,
  textPresets,
  trackPx,
} from "../theme";

// SettingsRow is the Settings screen's grouped-row primitive: a sentence-case
// label with an optional right slot — a mono `value`, a `right` node (Toggle /
// chevron), or nothing. `disabled` dims rows whose backend isn't wired yet;
// `danger` is the red Danger-zone ink. Grouping (card + dividers) is the
// caller's job, so the same row works in every group.
export function SettingsRow({
  label,
  value,
  right,
  onPress,
  disabled = false,
  danger = false,
}: {
  label: string;
  value?: string;
  right?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const content = (
    <>
      <Text
        style={[styles.label, danger && styles.dangerLabel]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {right ? (
        <View style={styles.right}>{right}</View>
      ) : value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
    </>
  );

  if (onPress && !disabled) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.row, disabled && styles.disabled]}
      accessibilityState={disabled ? { disabled: true } : undefined}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
  },
  label: { ...textPresets.body, color: colors.text.primary, flex: 1 },
  dangerLabel: { color: colors.text.danger },
  value: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    letterSpacing: trackPx(fontSize.caption, "normal"),
  },
  right: { marginLeft: space[2] },
  disabled: { opacity: 0.45 },
  pressed: { opacity: pressedOpacity },
});
