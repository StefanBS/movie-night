import { Pressable, StyleSheet, View } from "react-native";

import { colors, palette, pressedOpacity, radius } from "../theme";

// Toggle is the 44×26 Spotlight switch: ember track when on, neutral night-600 off.
export function Toggle({
  value,
  onValueChange,
  disabled = false,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        styles.track,
        { backgroundColor: value ? colors.accent.base : palette.night[600] },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 44,
    height: 26,
    borderRadius: radius.full,
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: "#FFFFFF",
  },
  knobOn: { alignSelf: "flex-end" },
  knobOff: { alignSelf: "flex-start" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: pressedOpacity },
});
