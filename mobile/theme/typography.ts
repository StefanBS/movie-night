// ============================================================
// Movie Night — Typography tokens · "Spotlight, refined"  (React Native port)
// Source of truth: docs/design-system/tokens.json (type styles) and
// components/bundle.css (scale, weights, leading, tracking).
//
// IMPORTANT (RN): the `fontFamily` strings below are the names you
// register with expo-font in app/_layout.tsx. Use those exact keys — RN has
// no font fallback stack like CSS, so the registered name must match.
// ============================================================

// Family keys must match the names passed to useFonts() in _layout.tsx.
// Roles: `display` = names and titles (800), `sans*` = UI and body,
// `serif*` = film titles and the one italic line under a title (italic only).
// There is no mono face: counts and dates use `sans` with `tabular`.
export const fontFamily = {
  display: "SchibstedGrotesk-ExtraBold",
  sans: "SchibstedGrotesk",
  sansMedium: "SchibstedGrotesk-Medium",
  sansSemibold: "SchibstedGrotesk-SemiBold",
  sansBold: "SchibstedGrotesk-Bold",
  serifItalic: "Newsreader-Italic",
  serifMediumItalic: "Newsreader-MediumItalic",
} as const;

// Weight is carried by the named static faces above — switch fontFamily rather
// than setting a numeric fontWeight, which those faces do not respond to.

// Type scale (px) — RN fontSize is unitless px
export const fontSize = {
  caption: 12, // badges, fine print
  sm: 14, // meta
  base: 16, // body, buttons, inputs
  lg: 18, // row names
  xl: 22, // section headings, film title in rows
  "2xl": 30, // bar titles
  "3xl": 44, // tab titles
  "4xl": 64, // card hero name
  display: 96, // the picker's name on Tonight
} as const;

// Line-height multipliers (CSS leading). RN lineHeight is absolute px,
// so compute: lineHeight = Math.round(fontSize * leading).
export const leading = {
  tight: 0.9, // display names
  none: 1, // tab titles (text-3xl)
  snug: 1.15,
  normal: 1.45,
} as const;

// Letter spacing in em — RN letterSpacing is absolute px, so multiply by size.
export const tracking = {
  display: -0.045, // 44px+
  title: -0.025, // 22–30px
  caption: 0.01,
  normal: 0,
} as const;

/** lh(16) -> 23 ; lh(96,'tight') -> 86 */
export const lh = (size: number, l: keyof typeof leading = "normal") =>
  Math.round(size * leading[l]);

/** trackPx(30,'title') -> -0.75 px of letterSpacing */
export const trackPx = (size: number, t: keyof typeof tracking = "normal") =>
  size * tracking[t];

// Tabular figures for counts and dates — spread into a style with a number.
export const tabular = { fontVariant: ["tabular-nums" as const] };

// Ready-made text presets — spread into a StyleSheet entry.
export const textPresets = {
  // "Movie Night" on the first-run Welcome (60 / 0.92 / −0.05em).
  heroWordmark: {
    fontFamily: fontFamily.display,
    fontSize: 60,
    lineHeight: Math.round(60 * 0.92),
    letterSpacing: 60 * -0.05,
  },
  // text-2xl: bar titles and step headings.
  screenTitle: {
    fontFamily: fontFamily.display,
    fontSize: fontSize["2xl"],
    lineHeight: lh(fontSize["2xl"], "snug"),
    letterSpacing: trackPx(fontSize["2xl"], "title"),
  },
  // text-xl: section headings; film title in rows.
  sectionHeading: {
    fontFamily: fontFamily.display,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, "snug"),
    letterSpacing: trackPx(fontSize.xl, "title"),
  },
  // text-lg: row names (600).
  rowName: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, "normal"),
  },
  // text-base: body, buttons, inputs.
  body: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, "normal"),
  },
  // text-sm: meta lines. Spread `tabular` in for counts and dates, but not for
  // prose: Schibsted's tabular figures widen the full stop too ("first . Ties").
  meta: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, "normal"),
  },
  // text-caption: badges, fine print. Sentence case, never uppercase.
  tag: {
    fontFamily: fontFamily.sansBold,
    fontSize: fontSize.caption,
    lineHeight: lh(fontSize.caption, "normal"),
    letterSpacing: trackPx(fontSize.caption, "caption"),
    ...tabular,
  },
  // Film titles and the one italic line under a title (34 / 1.1, italic).
  // Size it 26–44px; smaller in rows and on posters.
  filmTitle: {
    fontFamily: fontFamily.serifItalic,
    fontSize: 34,
    lineHeight: Math.round(34 * 1.1),
  },
  // ── App chrome (top bars + tab bar), per the TopBar spec ──
  // "Movie Night" beside the logomark in the home top bar (17 / 1.1 / −0.02em).
  wordmark: {
    fontFamily: fontFamily.display,
    fontSize: 17,
    lineHeight: Math.round(17 * 1.1),
    letterSpacing: 17 * -0.02,
  },
  // Large left-aligned title in the `tab` top bar (text-3xl).
  tabTitle: {
    fontFamily: fontFamily.display,
    fontSize: fontSize["3xl"],
    lineHeight: lh(fontSize["3xl"], "none"),
    letterSpacing: trackPx(fontSize["3xl"], "display"),
  },
  // Centered title in the `title` top bar (17, bold, −0.01em).
  barTitle: {
    fontFamily: fontFamily.sansBold,
    fontSize: 17,
    letterSpacing: 17 * -0.01,
  },
  // Back link beside a `title` top bar: primary text, never ember.
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
  // Group name under the home wordmark.
  barMeta: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
  },
} as const;
