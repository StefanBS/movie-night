import { type ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { borderWidth, createThemedStyles, space } from "../../theme";

// WizardFooter pins a step's action(s) to the bottom, clearing the safe-area
// inset, with a hairline top edge over the page.
export function WizardFooter({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: insets.bottom + space[4] }]}>
      {children}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  footer: {
    paddingHorizontal: space[5],
    paddingTop: space[3],
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.border.hairline,
    backgroundColor: colors.surface.page,
    gap: space[2],
  },
}));
