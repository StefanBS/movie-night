import * as React from "react";

/** A metric: big tabular number over a small label. `accent` turns the value ember. */
export interface StatProps {
  value: string | number;
  label: string;
  /** @default false */
  accent?: boolean;
  style?: React.CSSProperties;
}

export function Stat(props: StatProps): JSX.Element;
