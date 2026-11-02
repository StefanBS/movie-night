import { Text, View } from "react-native";

import { firstName } from "../lib/avatar";
import { createThemedStyles, fontFamily, fontSize, lh, space, textPresets, trackPx } from "../theme";

// PickerHero is the system's one hero pattern: the picker's first name set
// huge, an italic serif line under it ("picks the film."), and a short
// terracotta bar, the picker's mark. The name is the emphasis, so there is no
// card, glow or avatar. `meta` is an optional line above the name.
export function PickerHero({
  name,
  line = "picks the film.",
  meta,
  size = fontSize.display,
}: {
  name: string;
  line?: string;
  meta?: string;
  size?: number;
}) {
  const styles = useStyles();
  const lineSize = Math.round(size * 0.4);
  return (
    <View>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      <Text
        style={[
          styles.name,
          {
            fontSize: size,
            lineHeight: lh(size, "tight"),
            letterSpacing: trackPx(size, "display"),
          },
          meta ? styles.nameAfterMeta : null,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {firstName(name)}
      </Text>
      <Text style={[styles.line, { fontSize: lineSize, lineHeight: Math.round(lineSize * 1.1) }]}>
        {line}
      </Text>
      <View style={styles.bar} />
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  meta: { ...textPresets.meta, fontFamily: fontFamily.sansMedium, color: colors.text.secondary },
  name: { fontFamily: fontFamily.display, color: colors.text.primary },
  nameAfterMeta: { marginTop: space[3] },
  line: { fontFamily: fontFamily.serifItalic, color: colors.text.primary, marginTop: space[1] },
  bar: { width: 44, height: 4, backgroundColor: colors.accent.base, marginTop: space[4] },
}));
