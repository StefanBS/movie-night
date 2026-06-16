// ============================================================
// Movie Night — Typography tokens · "Spotlight"  (React Native port)
// Source of truth: design-system/tokens/typography.css
//
// IMPORTANT (RN): the `fontFamily` strings below are the names you
// register with expo-font in app/_layout.tsx (see handoff README).
// Use those exact keys — RN has no font fallback stack like CSS, so
// the registered name must match.
// ============================================================

// Family keys must match the names passed to useFonts() in _layout.tsx
export const fontFamily = {
  display: "InstrumentSerif", // cinematic editorial display & wordmark (400 only)
  displayItalic: "InstrumentSerif-Italic",
  sans: "HankenGrotesk", // warm, legible UI / body
  sansMedium: "HankenGrotesk-Medium",
  sansSemibold: "HankenGrotesk-SemiBold",
  sansBold: "HankenGrotesk-Bold",
  mono: "SpaceMono", // ticket-stub metadata (counts, dates)
  monoBold: "SpaceMono-Bold",
} as const;

// Numeric weights — only meaningful if you load variable/weighted faces.
// With named static faces above, prefer switching fontFamily over fontWeight.
export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

// Type scale (px) — RN fontSize is unitless px
export const fontSize = {
  caption: 12, // ticket tags / badges
  sm: 14, // meta, hints
  base: 16, // body, inputs
  lg: 18, // member / row names
  xl: 22, // section headings (sans)
  "2xl": 30, // screen titles (serif)
  "3xl": 44, // page display (serif)
  display: 68, // hero / splash wordmark (serif)
} as const;

// Line-height multipliers (CSS leading). RN lineHeight is absolute px,
// so compute: lineHeight = Math.round(fontSize * leading).
export const leading = {
  tight: 1.05, // serif display
  snug: 1.2,
  normal: 1.45,
} as const;

// Letter spacing — RN letterSpacing is absolute px (CSS em ≈ size * em)
export const tracking = {
  display: -0.01, // multiply by fontSize for px
  caption: 0.08,
  normal: 0,
} as const;

/** lh(16) -> 23 ; lh(68,'tight') -> 71 */
export const lh = (size: number, l: keyof typeof leading = "normal") =>
  Math.round(size * leading[l]);

/** trackPx(12,'caption') -> ~0.96 px of letterSpacing */
export const trackPx = (size: number, t: keyof typeof tracking = "normal") =>
  size * tracking[t];

// Ready-made text presets — spread into a StyleSheet entry.
export const textPresets = {
  heroWordmark: {
    fontFamily: fontFamily.display,
    fontSize: fontSize.display,
    lineHeight: lh(fontSize.display, "tight"),
    letterSpacing: trackPx(fontSize.display, "display"),
  },
  screenTitle: {
    fontFamily: fontFamily.display,
    fontSize: fontSize["2xl"],
    lineHeight: lh(fontSize["2xl"], "tight"),
  },
  sectionHeading: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, "snug"),
  },
  rowName: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, "normal"),
  },
  body: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, "normal"),
  },
  meta: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, "normal"),
  },
  // Small uppercase mono tag — the "ticket stub" status (e.g. NEXT UP)
  tag: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    letterSpacing: trackPx(fontSize.caption, "caption"),
    textTransform: "uppercase" as const,
  },
  // ── App chrome (top bars + tab bar) ──
  // Serif wordmark in the home top bar.
  wordmark: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: lh(20, "tight"),
    letterSpacing: trackPx(20, "display"),
  },
  // Large left-aligned serif title in the `tab` top bar.
  tabTitle: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: lh(34, "tight"),
    letterSpacing: trackPx(34, "display"),
  },
  // Centered serif title in the `title` top bar.
  barTitle: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: lh(24, "tight"),
    letterSpacing: trackPx(24, "display"),
  },
  // Ember back-link beside a `title` top bar.
  backLink: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 15,
    lineHeight: lh(15, "normal"),
  },
  // Bottom tab-bar item label (inactive weight; active swaps to sansBold).
  tabLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 11,
    lineHeight: lh(11, "normal"),
  },
  // Mono sub-line under a top-bar title (group name / count strip).
  barMeta: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    letterSpacing: 11 * 0.04,
  },
} as const;
