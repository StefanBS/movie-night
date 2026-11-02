import { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { createThemedStyles, fontFamily, pressedOpacity, space, textPresets } from "../theme";

// SettingsRow is the Settings screen's grouped-row primitive: a sentence-case
// label with an optional `value` and an optional `right` node (Toggle /
// chevron); a row with both shows the value before the node. `disabled` dims rows whose backend isn't wired yet;
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
  const styles = useStyles();
  const content = (
    <>
      <Text
        style={[styles.label, danger && styles.dangerLabel]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right ? <View>{right}</View> : null}
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
  label: {
    ...textPresets.body,
    fontFamily: fontFamily.sansMedium,
    color: colors.text.primary,
    flex: 1,
    minWidth: 0,
  },
  dangerLabel: { color: colors.text.danger },
  // No tabular figures: values can be prose ("Night before, morning of").
  value: { ...textPresets.meta, color: colors.text.secondary },
  disabled: { opacity: 0.45 },
  pressed: { opacity: pressedOpacity },
}));
