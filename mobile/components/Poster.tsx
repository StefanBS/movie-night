import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Film } from "lucide-react-native";

import { borderWidth, colors, fontFamily, radius, trackPx } from "../theme";

// Poster shows a real TMDB image when given a `uri`, and otherwise (or while loading /
// on error) the offline hue-per-title gradient tile from the prototype. `hue` is a
// stable 0–360 derived from the title by the caller.
export function Poster({
  uri,
  title = "—",
  year,
  hue = 250,
  w = 56,
  h = 84,
}: {
  uri?: string | null;
  title?: string;
  year?: string | number;
  hue?: number;
  w?: number;
  h?: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = !!uri && !failed;
  const withTitle = h >= 104;

  return (
    <View style={[styles.base, { width: w, height: h }]}>
      {showImage ? (
        <Image
          source={{ uri: uri! }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <LinearGradient
            colors={[`hsl(${hue} 42% 17%)`, `hsl(${hue} 48% 8%)`]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {withTitle ? (
            <View style={styles.caption}>
              <Text style={styles.title} numberOfLines={3}>
                {title}
              </Text>
              {year ? <Text style={styles.year}>{year}</Text> : null}
            </View>
          ) : (
            <View style={styles.center}>
              <Film size={16} color="rgba(241,238,250,0.4)" />
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.sm,
    overflow: "hidden",
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
    backgroundColor: colors.surface.card,
  },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  caption: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 9 },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 16,
    lineHeight: 17,
    color: colors.text.primary,
    letterSpacing: trackPx(16, "display"),
  },
  year: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    color: colors.text.secondary,
    marginTop: 3,
  },
});
