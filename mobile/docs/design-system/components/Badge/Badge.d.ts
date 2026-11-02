import * as React from "react";

/**
 * Small sentence-case status pill — "Next up", "Recorded", "Core", "Guest".
 * `solid` is the filled ember pill, reserved for the picker.
 */
export interface BadgeProps {
  children?: React.ReactNode;
  /** @default "accent" */
  tone?: "accent" | "neutral" | "muted" | "danger" | "success";
  /** Filled ember. @default false */
  solid?: boolean;
  style?: React.CSSProperties;
}

export function Badge(props: BadgeProps): JSX.Element;
