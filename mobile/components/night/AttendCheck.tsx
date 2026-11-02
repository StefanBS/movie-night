import { View } from "react-native";
import { Check } from "lucide-react-native";

import { borderWidth, createThemedStyles, radius, useColors } from "../../theme";

// AttendCheck is the in/out mark at the end of an attendance row: a filled
// disc with a check when the member is in, an empty ring when they're out.
export function AttendCheck({ on, size = 26 }: { on: boolean; size?: number }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View
      style={[styles.base, { width: size, height: size }, on ? styles.on : styles.off]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {on ? <Check size={Math.round(size / 2)} color={colors.surface.page} strokeWidth={3.2} /> : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  base: { borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  on: { backgroundColor: colors.text.primary },
  off: { borderWidth: borderWidth.regular, borderColor: colors.border.strong },
}));
