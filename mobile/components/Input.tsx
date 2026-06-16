import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  borderWidth,
  colors,
  fontFamily,
  pressedOpacity,
  radius,
  space,
  textPresets,
} from "../theme";

// Input is the Spotlight text field. With `addonLabel` it grows a trailing ember
// button (the "Search" affordance on the film-search field).
export function Input({
  value,
  onChangeText,
  placeholder,
  autoFocus = false,
  onSubmitEditing,
  addonLabel,
  onAddonPress,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  addonLabel?: string;
  onAddonPress?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, focused && styles.focused]}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.tertiary}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType={addonLabel ? "search" : "done"}
      />
      {addonLabel ? (
        <Pressable
          onPress={onAddonPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addon, pressed && styles.pressed]}
        >
          <Text style={styles.addonLabel}>{addonLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface.subtle,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
    paddingLeft: space[4],
    paddingRight: space[1],
    minHeight: 48,
  },
  focused: { borderColor: colors.border.focus },
  input: {
    flex: 1,
    ...textPresets.body,
    color: colors.text.primary,
    paddingVertical: space[3],
  },
  addon: {
    backgroundColor: colors.accent.base,
    borderRadius: radius.sm,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    marginLeft: space[2],
  },
  pressed: { opacity: pressedOpacity },
  addonLabel: {
    ...textPresets.meta,
    fontFamily: fontFamily.sansSemibold,
    color: colors.text.onAccent,
  },
});
