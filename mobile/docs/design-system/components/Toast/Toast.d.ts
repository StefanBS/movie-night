import * as React from "react";

/** Confirmation card shown briefly after a save. Presentational only. */
export interface ToastProps {
  title: string;
  body?: string;
  style?: React.CSSProperties;
}

export function Toast(props: ToastProps): JSX.Element;
