import { Pressable, Text, View } from "react-native";

import { createThemedStyles, fontFamily, fontSize, pressedOpacity, radius, space } from "../theme";

// Segmented is a pill of a few mutually exclusive choices for a settings row
// (Settings › Theme). The chosen segment is a raised neutral chip, not accent:
// the accent is rationed to the picker and the screen's one primary action.
// Each segment is a radio for screen readers.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.track} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            hitSlop={{ top: 8, bottom: 8 }}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.selected,
              pressed && !selected && styles.pressed,
            ]}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = createThemedStyles((colors, shadow) => ({
  track: {
    flexDirection: "row",
    backgroundColor: colors.surface.subtle,
    borderRadius: radius.full,
    padding: 3,
  },
  segment: {
    paddingHorizontal: space[3],
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  selected: { backgroundColor: colors.surface.raised, ...shadow.sm },
  pressed: { opacity: pressedOpacity },
  label: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.text.secondary },
  selectedLabel: { color: colors.text.primary },
}));
