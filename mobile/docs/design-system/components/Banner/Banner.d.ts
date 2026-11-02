import * as React from "react";

/** Inline message strip — screen-level errors ("Couldn't load turn order: …") and hints. */
export interface BannerProps {
  children?: React.ReactNode;
  /** @default "info" */
  tone?: "danger" | "info" | "success";
  style?: React.CSSProperties;
}

export function Banner(props: BannerProps): JSX.Element;
