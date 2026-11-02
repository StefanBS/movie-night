// ============================================================
// Movie Night — Spacing, radius, border, shadow, motion · "Spotlight, refined"
// Source of truth: docs/design-system/tokens.json (+ components/bundle.css
// for motion). 4px base grid.
// ============================================================

import type { ViewStyle } from "react-native";

import type { ColorSchemeName } from "./colors";

// Spacing — 4px grid
export const space = {
  1: 4, // icon to label
  2: 8, // inside buttons and badges
  3: 12, // between row elements
  4: 16, // card and row padding
  5: 20, // screen gutters (narrow)
  6: 24, // screen gutters; between sections
  8: 32, // between stats; large section breaks
  10: 40, // above a screen's first section
  12: 48, // large vertical breaks
  16: 64, // hero spacing on Tonight
} as const;

// Radius
export const radius = {
  sm: 4, // posters
  md: 12, // inputs, toasts, banners
  lg: 18, // cards, settings groups
  xl: 28, // sheets, hero cards
  full: 999, // buttons, badges, avatars: pills and discs
} as const;

export const borderWidth = {
  hairline: 1, // between rows, input rings
  regular: 1.5, // emphasised outlines
  ring: 2, // today ring on the calendar; focus outlines
} as const;

// Shadows — quiet, theme-specific, floating surfaces only. Nothing glows.
// RN (new architecture) and RN Web both render the CSS `boxShadow` string, so
// these are the token values verbatim. Spread a preset into a style; read the
// active theme's set through `createThemedStyles()` (theme/useColors.ts).
export type Shadows = {
  none: ViewStyle;
  sm: ViewStyle; // small floating elements
  md: ViewStyle; // toasts and menus
  lg: ViewStyle; // sheets
  focus: ViewStyle; // the halo around a focused input or control
};

export const shadow: Record<ColorSchemeName, Shadows> = {
  dark: {
    none: {},
    sm: { boxShadow: "0 1px 2px rgba(0, 0, 0, 0.40)" },
    md: { boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)" },
    lg: { boxShadow: "0 20px 48px rgba(0, 0, 0, 0.55)" },
    focus: { boxShadow: "0 0 0 3px rgba(200, 105, 63, 0.40)" },
  },
  light: {
    none: {},
    sm: { boxShadow: "0 1px 2px rgba(17, 16, 14, 0.08)" },
    md: { boxShadow: "0 8px 24px rgba(17, 16, 14, 0.10)" },
    lg: { boxShadow: "0 20px 48px rgba(17, 16, 14, 0.14)" },
    focus: { boxShadow: "0 0 0 3px rgba(169, 85, 47, 0.28)" },
  },
};

// Interaction
export const pressedOpacity = 0.72;

// Motion (ms) — ease-out; respect reduced motion.
export const duration = {
  fast: 130,
  base: 220,
} as const;
