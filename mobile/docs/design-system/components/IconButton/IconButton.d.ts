import * as React from "react";

/**
 * Round, borderless tap target for a single icon (Lucide glyph as children).
 * `filled` adds a subtle surface — used for top-bar actions like Settings.
 */
export interface IconButtonProps {
  children?: React.ReactNode;
  /** @default "md" */
  size?: "sm" | "md";
  /** Accessible label (also the tooltip). */
  label?: string;
  /** @default false */
  filled?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  style?: React.CSSProperties;
}

export function IconButton(props: IconButtonProps): JSX.Element;
