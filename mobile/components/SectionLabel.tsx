import { Text } from "react-native";

import { createThemedStyles, fontFamily, lh, space } from "../theme";

// SectionLabel is the small group heading above a list: sentence case, 13px
// semibold, secondary colour. Never uppercase. `marginTop` overrides the
// default gap above it (Watched spaces its months 20, then 28).
export function SectionLabel({
  children,
  marginTop,
}: {
  children: string;
  marginTop?: number;
}) {
  const styles = useStyles();
  return (
    <Text style={[styles.label, marginTop !== undefined && { marginTop }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

const useStyles = createThemedStyles((colors) => ({
  label: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 13,
    lineHeight: lh(13),
    color: colors.text.secondary,
    marginTop: space[6],
    marginBottom: space[2],
  },
}));
