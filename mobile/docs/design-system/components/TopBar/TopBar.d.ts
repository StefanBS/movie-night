import * as React from "react";

/**
 * App top bar. `home` (logomark + wordmark + group), `tab` (big left title +
 * italic sub), `title` (centered title + back link, for pushed screens).
 */
export interface TopBarProps {
  /** @default "tab" */
  kind?: "home" | "tab" | "title";
  title?: string;
  /** tab: italic line under the title. */
  sub?: string;
  /** home: the group name. */
  group?: string;
  /** title: back link. */
  back?: { label: string; onClick: () => void };
  right?: React.ReactNode;
  style?: React.CSSProperties;
}

export function TopBar(props: TopBarProps): JSX.Element;
