import * as React from "react";

/**
 * Single-line text field — member names, film search. 48px tall, card
 * surface, hairline ring, ember focus ring, red ring when `invalid`.
 */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "style"> {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  /** @default false */
  invalid?: boolean;
  disabled?: boolean;
  /** Trailing element, e.g. a Button. */
  addon?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Input(props: InputProps): JSX.Element;
