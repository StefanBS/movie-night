import * as React from "react";

/**
 * Grouped settings row: label, optional value, optional right node
 * (Toggle / chevron). Wrap rows in a card yourself; set `divider` between.
 */
export interface SettingsRowProps {
  label: string;
  value?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  /** @default false */
  disabled?: boolean;
  /** Red label for the danger zone. @default false */
  danger?: boolean;
  /** Hairline beneath. @default false */
  divider?: boolean;
  style?: React.CSSProperties;
}

export function SettingsRow(props: SettingsRowProps): JSX.Element;
