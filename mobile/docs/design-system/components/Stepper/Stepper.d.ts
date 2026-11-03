import * as React from "react";

/** Wizard progress — segmented bar with labels (Date · People · Movie · Done). */
export interface StepperProps {
  /** Zero-based current step. @default 0 */
  current?: number;
  /** @default ["Date","People","Movie","Done"] */
  steps?: string[];
  style?: React.CSSProperties;
}

export function Stepper(props: StepperProps): JSX.Element;
