// ============================================================
// Movie Night — active theme hooks
// Dark is the default; light follows the OS appearance (app.json
// `userInterfaceStyle: "automatic"`) unless Settings › Appearance pins one,
// which overrides what useColorScheme() reports (appearance.ts).
// ============================================================

import {
  StyleSheet,
  useColorScheme,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { colors, type ColorSchemeName, type Colors } from "./colors";
import { shadow, type Shadows } from "./spacing";

/** The active theme: "light" only when the OS (or the Appearance setting) says so, otherwise dark. */
export function useScheme(): ColorSchemeName {
  return useColorScheme() === "light" ? "light" : "dark";
}

/** The active theme's semantic colours, for inline props (icon colours etc.). */
export function useColors(): Colors {
  return colors[useScheme()];
}

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

/**
 * Builds a component's StyleSheet once per theme, at module load, and returns a
 * hook that picks the active one:
 *
 *   const useStyles = createThemedStyles((colors, shadow) => ({
 *     card: { backgroundColor: colors.surface.card, ...shadow.md },
 *   }));
 *   // in the component:
 *   const styles = useStyles();
 */
export function createThemedStyles<T extends NamedStyles>(
  factory: (colors: Colors, shadow: Shadows) => T,
): () => Readonly<T> {
  const sheets: Record<ColorSchemeName, Readonly<T>> = {
    dark: StyleSheet.create(factory(colors.dark, shadow.dark)),
    light: StyleSheet.create(factory(colors.light, shadow.light)),
  };
  return function useThemedStyles() {
    return sheets[useScheme()];
  };
}
