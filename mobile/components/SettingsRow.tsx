import { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";

import { createThemedStyles, fontFamily, pressedOpacity, space, textPresets, useColors } from "../theme";

// SettingsRow is the Settings screen's grouped-row primitive: a sentence-case
// label (with an optional quieter `sub` line under it) and an optional `value` and an optional `right` node (Toggle /
// chevron); a row with both shows the value before the node. `disabled` dims rows whose backend isn't wired yet;
// `danger` is the red Danger-zone ink. `checked` makes it one choice in a group
// (Appearance): a radio for screen readers, with a check when it's the one
// chosen. Grouping (card + dividers) is the
// caller's job, so the same row works in every group.
export function SettingsRow({
  label,
  sub,
  value,
  right,
  onPress,
  disabled = false,
  danger = false,
  checked,
}: {
  label: string;
  sub?: string;
  value?: string;
  right?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  // Primary ink, not accent: the accent is rationed to the picker and the
  // screen's one primary action.
  const trailing =
    checked === undefined ? right : checked ? <Check size={18} color={colors.text.primary} /> : null;
  const content = (
    <>
      <View style={styles.text}>
        <Text
          style={[styles.label, danger && styles.dangerLabel]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing ? <View>{trailing}</View> : null}
    </>
  );

  if (onPress && !disabled) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole={checked !== undefined ? "radio" : undefined}
        accessibilityState={checked !== undefined ? { checked } : undefined}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.row, disabled && styles.disabled]}
      accessibilityRole={disabled ? "button" : undefined}
      accessibilityState={disabled ? { disabled: true } : undefined}
    >
      {content}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: 52,
    paddingHorizontal: space[4],
  },
  text: { flex: 1, minWidth: 0, paddingVertical: space[3] },
  label: {
    ...textPresets.body,
    fontFamily: fontFamily.sansMedium,
    color: colors.text.primary,
  },
  sub: { ...textPresets.meta, color: colors.text.tertiary, marginTop: 2 },
  dangerLabel: { color: colors.text.danger },
  // No tabular figures: values can be prose ("Night before, morning of").
  value: { ...textPresets.meta, color: colors.text.secondary },
  disabled: { opacity: 0.45 },
  pressed: { opacity: pressedOpacity },
}));
