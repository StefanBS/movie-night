import * as React from "react";

/**
 * Pill-shaped action control. `primary` is the ember fill — one per screen,
 * reserved for the main action ("Start the night"). `secondary` is a hairline
 * outline, `ghost` is a quiet text action ("Skip turn"), `danger` is red text.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** @default "primary" */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** @default false */
  fullWidth?: boolean;
  children?: React.ReactNode;
}

export function Button(props: ButtonProps): JSX.Element;
