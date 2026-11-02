import * as React from "react";

/** 44×26 on/off switch for settings rows. Ember when on. */
export interface ToggleProps {
  value?: boolean;
  onChange?: (next: boolean) => void;
  /** Accessible name. */
  label: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function Toggle(props: ToggleProps): JSX.Element;
