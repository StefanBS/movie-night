import { Pressable, StyleSheet, View } from "react-native";

import { colors, radius, shadow } from "../theme";

// Toggle is the 44×26 on/off pill for settings rows: ember when on, velvet
// when off, with a white knob. The row's label names it for screen readers.
export function Toggle({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      hitSlop={8}
      style={[styles.track, value ? styles.on : styles.off, disabled && styles.disabled]}
    >
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 44, height: 26, borderRadius: radius.full, padding: 3 },
  on: { backgroundColor: colors.accent.base },
  off: { backgroundColor: colors.control.trackOff },
  disabled: { opacity: 0.45 },
  knob: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: colors.control.knob,
    ...shadow.sm,
  },
  knobOn: { transform: [{ translateX: 18 }] },
});
