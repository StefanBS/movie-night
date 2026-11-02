import { Text, View } from "react-native";

import { createThemedStyles, fontFamily, radius, useColors } from "../theme";
import { initials, signatureColor } from "../lib/avatar";

// Avatar is a deterministic initials chip (no photos) on the member's signature
// colour, hashed from the name. It never marks the picker: no ring, glow or
// accent. That's the job of the picker's name and the Next up badge.
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const styles = useStyles();
  const colors = useColors();
  const fontSize = Math.round(size * 0.36);
  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          backgroundColor: signatureColor(name, colors.sig),
        },
      ]}
    >
      <Text
        style={[styles.label, { fontSize, letterSpacing: fontSize * -0.01 }]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  label: {
    fontFamily: fontFamily.sansBold,
    color: colors.text.onSig,
  },
}));
