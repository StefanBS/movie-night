// ============================================================
// Movie Night — Color tokens · "Spotlight, refined"  (React Native port)
// Source of truth: docs/design-system/tokens.json (both themes).
// Two themes from one warm `ink` scale: dark (default) and light. Screens read
// the active theme through `useColors()` / `createThemedStyles()`
// (theme/useColors.ts) and reference the SEMANTIC groups — never the palette.
//
// This file stays free of react-native imports: lib/avatar.ts reads it under
// plain Node in unit tests.
// ============================================================

// --- Raw palette (avoid using directly in screens) ---
export const palette = {
  ink: {
    0: "#FFFFFF",
    50: "#F4F1EC",
    100: "#EDE8E0",
    150: "#E4DFD6",
    200: "#D6D0C6",
    300: "#B5AEA3",
    400: "#9C958A",
    450: "#857F76",
    500: "#7A7369",
    600: "#5C564E",
    700: "#3B3833",
    800: "#2A2824",
    850: "#221F1C",
    900: "#1A1816",
    950: "#11100E",
    1000: "#0A0908",
  },
  // Terracotta. Keeps the `ember` name from the first Spotlight.
  ember: {
    100: "#F3D5C6",
    200: "#E6AE93",
    300: "#D47E57",
    400: "#C8693F", // the brand terracotta: the accent in dark
    500: "#A9552F", // the accent in light
    600: "#934826",
    700: "#73381D",
  },
  // "Film stock" member signature hues: -300 on dark, -600 on light.
  sig: {
    gold: { 300: "#8E7B4C", 600: "#7E6B3E" },
    teal: { 300: "#4E7A78", 600: "#43706E" },
    lilac: { 300: "#6C6390", 600: "#5F5684" },
    sage: { 300: "#5E7C58", 600: "#52704C" },
    rose: { 300: "#97605F", 600: "#8A5352" },
    sky: { 300: "#566F93", 600: "#4B6488" },
    sand: { 300: "#85705A", 600: "#776350" },
  },
  red: { 400: "#F0705F", 600: "#C23A2B" },
  green: { 400: "#7BC79A", 600: "#2F8A55" },
} as const;

const { ink, ember, sig, red, green } = palette;

// --- Semantic aliases (use THESE in screens) ---
const dark = {
  text: {
    primary: ink[100] as string,
    secondary: ink[400] as string,
    tertiary: ink[450] as string,
    link: ink[100] as string, // links are primary text, never ember
    danger: red[400] as string,
    onAccent: ink[950] as string,
    onDark: ink[100] as string,
    onDarkSecondary: ink[400] as string,
    onDarkAccent: ember[400] as string,
    onSig: ink[0] as string, // initials on sig avatars
  },
  surface: {
    page: ink[950] as string,
    card: ink[900] as string,
    subtle: ink[850] as string,
    raised: ink[800] as string, // sheets, menus
    spotlight: "rgba(200, 105, 63, 0.14)", // selected tint only, never a glow
    dark: ink[1000] as string,
    tabBar: "rgba(17, 16, 14, 0.88)",
    danger: "rgba(240, 112, 95, 0.12)",
    success: "rgba(123, 199, 154, 0.12)",
  },
  accent: {
    // The one accent: the picker's mark, the Next up badge and the single
    // primary action per screen. Nowhere else.
    base: ember[400] as string,
    hover: ember[300] as string,
    pressed: ember[500] as string,
    strong: ember[400] as string, // ember text/icons on page and card
    glow: "rgba(200, 105, 63, 0.40)", // focus halos
  },
  border: {
    hairline: "rgba(237, 232, 224, 0.10)",
    strong: "rgba(237, 232, 224, 0.22)",
    focus: ember[400] as string,
    onDark: ink[800] as string,
  },
  feedback: {
    danger: red[400] as string,
    success: green[400] as string,
  },
  // Toggle: the track is accent.base when on.
  control: {
    trackOff: ink[700] as string,
    knob: ink[100] as string,
  },
  // Member signature colours sig-1…7: gold, teal, lilac, sage, rose, sky, sand.
  sig: [
    sig.gold[300],
    sig.teal[300],
    sig.lilac[300],
    sig.sage[300],
    sig.rose[300],
    sig.sky[300],
    sig.sand[300],
  ] as readonly string[],
};

export type Colors = typeof dark;

const light: Colors = {
  text: {
    primary: ink[950],
    secondary: ink[600],
    tertiary: ink[500], // 4.16:1 on page: 14px+ hints, not body copy
    link: ink[950],
    danger: red[600],
    onAccent: ink[0],
    onDark: ink[100],
    onDarkSecondary: ink[400],
    onDarkAccent: ember[400],
    onSig: ink[0],
  },
  surface: {
    page: ink[50],
    card: ink[0],
    subtle: ink[150],
    raised: ink[0],
    spotlight: "rgba(169, 85, 47, 0.10)",
    dark: ink[950],
    tabBar: "rgba(244, 241, 236, 0.90)",
    danger: "rgba(194, 58, 43, 0.08)",
    success: "rgba(47, 138, 85, 0.08)",
  },
  accent: {
    base: ember[500],
    hover: ember[600],
    pressed: ember[600],
    strong: ember[600],
    glow: "rgba(169, 85, 47, 0.28)",
  },
  border: {
    hairline: "rgba(17, 16, 14, 0.10)",
    strong: "rgba(17, 16, 14, 0.22)",
    focus: ember[500],
    onDark: ink[800],
  },
  feedback: {
    danger: red[600],
    success: green[600],
  },
  control: {
    trackOff: ink[200],
    knob: ink[0],
  },
  sig: [
    sig.gold[600],
    sig.teal[600],
    sig.lilac[600],
    sig.sage[600],
    sig.rose[600],
    sig.sky[600],
    sig.sand[600],
  ],
};

export type ColorSchemeName = "dark" | "light";

export const colors: Record<ColorSchemeName, Colors> = { dark, light };
