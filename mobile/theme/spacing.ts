// ============================================================
// Movie Night — Spacing, radius, border, shadow, motion · "Spotlight"
// Source of truth: design-system/tokens/spacing.css
// 4px base grid.
// ============================================================

import { Platform, type ViewStyle } from "react-native";

// Spacing — 4px grid
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// Radius
export const radius = {
  sm: 6, // poster thumbnail, tags
  md: 10, // buttons, inputs, rows
  lg: 16, // cards
  xl: 24, // sheets, hero panels
  full: 999,
} as const;

export const borderWidth = {
  hairline: 1,
  regular: 1.5,
} as const;

// Shadows — iOS/Android use shadow* + elevation; web uses boxShadow (RN Web
// deprecates shadow* style props). Each preset is an object you spread into a
// style. The signature ember "spotlight" can't be a true glow in RN —
// approximate with an ember shadowColor + border.
type ShadowPreset = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function platformShadow(preset: ShadowPreset): ViewStyle {
  if (Platform.OS === "web") {
    const color = hexToRgba(preset.shadowColor, preset.shadowOpacity);
    const { width, height } = preset.shadowOffset;
    return {
      boxShadow: `${width}px ${height}px ${preset.shadowRadius}px 0px ${color}`,
    };
  }
  return preset;
}

export const shadow = {
  none: {},
  sm: platformShadow({
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 1,
  }),
  md: platformShadow({
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.42,
    shadowRadius: 18,
    elevation: 6,
  }),
  lg: platformShadow({
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.55,
    shadowRadius: 44,
    elevation: 12,
  }),
  // Spotlight — the ember glow on the active ("next up") element.
  // Pair with a 1px ember border on the same view for the ring.
  spotlight: platformShadow({
    shadowColor: "#F68B36",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 26,
    elevation: 8,
  }),
} as const;

// Motion — for react-native Animated / Reanimated easings
export const motion = {
  durationFast: 130,
  durationBase: 220,
  // bezier control points — feed to Easing.bezier(...)
  easeStandard: [0.2, 0, 0, 1] as const,
  easeOut: [0.16, 1, 0.3, 1] as const,
} as const;

// Interaction
export const pressedOpacity = 0.72;
