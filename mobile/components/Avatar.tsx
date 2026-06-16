import { StyleSheet, Text, View } from "react-native";

import { borderWidth, colors, fontFamily, radius, shadow } from "../theme";
import { avatarTint, initials } from "../lib/avatar";

// Avatar is a deterministic initials chip (no photos): the name hashes to one of the
// logo-ring jewel tints. `glow` gives it the ember "next up" ring used on the picker.
export function Avatar({
  name,
  size = 40,
  glow = false,
}: {
  name: string;
  size?: number;
  glow?: boolean;
}) {
  const tint = avatarTint(name);
  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: radius.full,
          backgroundColor: tint,
        },
        glow && styles.glow,
      ]}
    >
      <Text
        style={[styles.label, { fontSize: Math.round(size * 0.42) }]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  glow: {
    borderWidth: borderWidth.hairline,
    borderColor: colors.accent.base,
    ...shadow.spotlight,
  },
  label: {
    fontFamily: fontFamily.sansBold,
    color: colors.text.onAccent, // deep-night ink reads on every jewel tint
  },
});
