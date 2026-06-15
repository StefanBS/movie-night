// ============================================================
// Movie Night — "Spotlight" theme  (React Native)
// Single import surface:  import { theme } from "@/theme";
// or cherry-pick:         import { colors, space } from "@/theme";
// ============================================================

import { colors, palette } from "./colors";
import {
  fontFamily,
  fontWeight,
  fontSize,
  leading,
  tracking,
  textPresets,
  lh,
  trackPx,
} from "./typography";
import {
  space,
  radius,
  borderWidth,
  shadow,
  motion,
  pressedOpacity,
} from "./spacing";

export * from "./colors";
export * from "./typography";
export * from "./spacing";

export const theme = {
  colors,
  palette,
  fontFamily,
  fontWeight,
  fontSize,
  leading,
  tracking,
  textPresets,
  lh,
  trackPx,
  space,
  radius,
  borderWidth,
  shadow,
  motion,
  pressedOpacity,
} as const;

export type Theme = typeof theme;
