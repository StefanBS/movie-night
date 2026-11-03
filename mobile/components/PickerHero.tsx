import { Text, View } from "react-native";

import { firstName } from "../lib/avatar";
import { createThemedStyles, fontFamily, fontSize, lh, space, textPresets, trackPx } from "../theme";

// PickerHero is the system's one hero pattern: the picker's first name in the
// display style, a serif line under it ("picks the film.") at 0.46 of that
// size, and a short terracotta bar, the picker's mark. The name is the emphasis, so there
// is no card, glow or avatar. `meta` is an optional line above the name.
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
  const lineSize = Math.round(size * 0.46);
  return (
    <View>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      <Text
        style={[
          styles.name,
          {
            fontSize: size,
            lineHeight: lh(size, "display"),
            letterSpacing: trackPx(size, "display"),
          },
          meta ? styles.nameAfterMeta : null,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {firstName(name)}
      </Text>
      <Text style={[styles.line, { fontSize: lineSize, lineHeight: lh(lineSize, "snug") }]}>
        {line}
      </Text>
      <View style={styles.bar} />
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  meta: { ...textPresets.meta, fontFamily: fontFamily.sansMedium, color: colors.text.secondary },
  name: { fontFamily: fontFamily.display, color: colors.text.primary },
  // The 10px meta → name gap and the bar's 3px height and 14px offset are off
  // the 4px grid, but they are the spec's values (chrome.jsx PickerHero).
  nameAfterMeta: { marginTop: 10 },
  line: { fontFamily: fontFamily.serifMedium, color: colors.text.primary, marginTop: space[1] },
  bar: { width: 36, height: 3, backgroundColor: colors.accent.base, marginTop: 14 },
}));
