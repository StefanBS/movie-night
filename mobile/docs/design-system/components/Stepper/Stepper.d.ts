import * as React from "react";

/** Wizard progress — segmented bar with labels (When · Here · Pick · Done). */
export interface StepperProps {
  /** Zero-based current step. @default 0 */
  current?: number;
  /** @default ["When","Here","Pick","Done"] */
  steps?: string[];
  style?: React.CSSProperties;
}

export function Stepper(props: StepperProps): JSX.Element;
