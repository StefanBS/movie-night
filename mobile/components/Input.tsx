import { useState } from "react";
import { TextInput, View } from "react-native";

import { AppButton } from "./AppButton";
import { createThemedStyles, radius, space, textPresets, useColors } from "../theme";

// Input is the single-line text field: the card surface, a 12px radius, a
// hairline ring that turns into the accent focus ring. With `addonLabel` a
// primary button sits beside it (the "Search" on the film-search field), so
// only use it where that button is the screen's main action.
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
  const colors = useColors();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <View style={[styles.field, focused ? styles.focused : styles.idle]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.text.tertiary}
          // Android's own caret and handles are an off-palette teal; ink them
          // like the text, as a web caret is (never the accent).
          cursorColor={colors.text.primary}
          selectionHandleColor={colors.text.primary}
          autoFocus={autoFocus}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          returnKeyType={addonLabel ? "search" : "done"}
        />
      </View>
      {addonLabel && onAddonPress ? <AppButton title={addonLabel} onPress={onAddonPress} /> : null}
    </View>
  );
}

// The rings are inset box shadows (as in the DS), so focusing doesn't shift
// the layout the way a thicker border would. The fill and ring sit on a View
// around the TextInput: on Android a box shadow on the TextInput itself
// replaces its native background, which drops its padding, and the text
// would run into the ring.
const useStyles = createThemedStyles((colors, shadow) => ({
  wrap: { flexDirection: "row", alignItems: "center", gap: space[2] },
  field: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface.card,
    borderRadius: radius.md,
  },
  input: {
    height: 48,
    ...textPresets.body,
    color: colors.text.primary,
    paddingHorizontal: space[4],
  },
  idle: { boxShadow: `inset 0 0 0 1px ${colors.border.hairline}` },
  focused: { boxShadow: `inset 0 0 0 1.5px ${colors.border.focus}, ${String(shadow.focus.boxShadow)}` },
}));
