// ============================================================
// Movie Night — Color tokens · "Spotlight"  (React Native port)
// Source of truth: design-system/tokens/colors.css
// CSS custom properties resolved to literal values for RN StyleSheet.
// Reference the SEMANTIC groups (text / surface / accent / border) in
// screens — not the raw palette — so a future retheme is one edit here.
// ============================================================

// --- Raw palette (avoid using directly in screens) ---
export const palette = {
  night: {
    950: "#0C0A1B", // deepest — app backdrop / marquee hero
    900: "#131129", // page — the dim room
    850: "#191634",
    800: "#201C3D", // card surface — the velvet sofa
    700: "#2B2552", // raised / subtle surface
    600: "#3A3068", // hover / pressed velvet
    500: "#4E4287", // muted fills, strong borders
    400: "#6E5FA8",
  },
  ember: {
    700: "#A9491A",
    600: "#CC5E1E",
    500: "#E5752A", // pressed
    400: "#F68B36", // brand ember — the fire
    300: "#FBA75A", // ember text/icons on dark (accessible)
    200: "#FFC084",
    100: "#FFD6A8",
  },
  moon: {
    400: "#8C9CEC", // moonlight accent
    300: "#AAB7F1",
    200: "#C9D1F7",
    100: "#E4E8FB",
  },
  haze: {
    100: "#F1EEFA", // primary text
    200: "#D7D2EC",
    300: "#B4ADCF", // secondary text
    400: "#897FA6", // tertiary text
  },
  red: { 600: "#D2493B", 500: "#F07A6B" },
  green: { 600: "#3E9A6A", 500: "#6FCB97" },
} as const;

// --- Semantic aliases (use THESE in screens) ---
export const colors = {
  text: {
    primary: palette.haze[100],
    secondary: palette.haze[300],
    tertiary: palette.haze[400],
    link: palette.haze[100],
    danger: palette.red[500],
    onAccent: "#1A1228", // deep night ink on the ember CTA
    onDark: palette.haze[100],
    onDarkSecondary: "rgba(241, 238, 250, 0.60)",
    onDarkAccent: palette.ember[300],
  },
  surface: {
    page: palette.night[900],
    card: palette.night[800],
    subtle: palette.night[700],
    spotlight: "rgba(246, 139, 54, 0.15)", // the bonfire wash — "next up"
    dark: palette.night[950], // deepest theater / hero / marquee
    tabBar: "rgba(12, 10, 27, 0.86)", // night-950 @ 86% — the blurred bottom tab bar
    danger: "rgba(240, 122, 107, 0.13)",
    success: "rgba(111, 203, 151, 0.13)",
  },
  accent: {
    base: palette.ember[400], // the ember / spotlight
    hover: palette.ember[300], // on dark, hover brightens one step
    pressed: palette.ember[500],
    strong: palette.ember[300], // ember text/icons where contrast is needed
    glow: "rgba(246, 139, 54, 0.45)", // the bonfire halo
    cool: palette.moon[400], // the moonlight, answering the fire
    coolStrong: palette.moon[300],
    moonGlow: "rgba(140, 156, 236, 0.40)",
  },
  border: {
    hairline: "rgba(228, 224, 247, 0.11)",
    strong: "rgba(228, 224, 247, 0.20)",
    focus: palette.ember[400],
    onDark: palette.night[600],
  },
  feedback: {
    danger: palette.red[500],
    success: palette.green[500],
  },
} as const;

// --- Avatar tints — the seven jewel friends of the logo ring (assets/brand/logomark.svg).
// A name hashes to one of these so a person is always the same color (no photos).
export const avatarTints = [
  "#F4B36A", // warm gold
  "#EC92AC", // rose
  "#D79BD6", // orchid
  "#B79BEA", // violet
  "#9DA8EE", // periwinkle
  "#8C9CEC", // moon
  "#6FC6D6", // teal
] as const;
