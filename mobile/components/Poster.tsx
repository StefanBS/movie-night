import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { createThemedStyles, fontFamily, radius, space, tabular } from "../theme";

// Poster shows a real TMDB image when given a `uri`, untreated at 2:3, and
// otherwise (or on error) a warm gradient tile. The tile is always
// dark, whatever the theme; from 104px tall it carries the title in Newsreader
// Medium.
export function Poster({
  uri,
  title = "—",
  year,
  w = 56,
  h = 84,
  rounded = radius.sm,
}: {
  uri?: string | null;
  title?: string;
  year?: string | number;
  w?: number;
  h?: number;
  // rounded is the corner radius: posters are radius.sm, except where a
  // screen's spec sets another (the Done screen's radius.md).
  rounded?: number;
}) {
  const styles = useStyles();
  const [failed, setFailed] = useState(false);
  const showImage = !!uri && !failed;
  const withTitle = h >= 104;

  return (
    <View style={[styles.base, { width: w, height: h, borderRadius: rounded }]}>
      {showImage ? (
        <Image
          source={{ uri: uri! }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          {/* 160deg, as in the DS */}
          <LinearGradient
            colors={["hsl(30 30% 26%)", "hsl(30 34% 12%)"]}
            start={{ x: 0.33, y: 0 }}
            end={{ x: 0.67, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {withTitle ? (
            <View style={styles.caption}>
              <Text style={styles.title} numberOfLines={3}>
                {title}
              </Text>
              {year ? <Text style={styles.year}>{year}</Text> : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  base: {
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surface.dark,
    // A faint inner edge so a fallback tile doesn't melt into a dark page.
    boxShadow: `inset 0 0 0 1px ${colors.border.hairline}`,
  },
  caption: { position: "absolute", left: 10, right: 10, bottom: 10 },
  title: {
    fontFamily: fontFamily.serifMedium,
    fontSize: 16,
    lineHeight: Math.round(16 * 1.1),
    color: colors.text.onDark,
  },
  year: {
    fontFamily: fontFamily.sans,
    ...tabular,
    fontSize: 11,
    color: colors.text.onDarkSecondary,
    marginTop: space[1],
  },
}));
