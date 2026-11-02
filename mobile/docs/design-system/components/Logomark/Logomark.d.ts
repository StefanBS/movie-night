import * as React from "react";

/**
 * The Movie Night mark: a calendar page with an ember play button — the film
 * is the plan for the day. Frame uses currentColor; play is --accent.
 * `tile` = dark app-icon tile.
 */
export interface LogomarkProps {
  /** Mark size in px. @default 32 */
  size?: number;
  /** Render on a dark app-icon tile. @default false */
  tile?: boolean;
  style?: React.CSSProperties;
}

export function Logomark(props: LogomarkProps): JSX.Element;
