import * as React from "react";

/**
 * Bottom navigation: Tonight · Watched · Club. 24px Lucide icon over
 * a 12px label; active = text-primary + semibold, inactive = text-secondary.
 * Never ember. Settings lives behind the top-bar gear, not here.
 */
export interface TabBarTab {
  id: string;
  label: string;
  /** A built-in icon name ("clapperboard" | "calendar-days" | "library" | "users-round") or your own 24px node. */
  icon: string | React.ReactNode;
}

export interface TabBarProps {
  /** Id of the current tab. @default "tonight" */
  active?: "tonight" | "watched" | "club" | string;
  /** Called with the tapped tab's id. */
  onChange?: (id: string) => void;
  /** @default Tonight · Watched · Club */
  tabs?: TabBarTab[];
  style?: React.CSSProperties;
}

export function TabBar(props: TabBarProps): JSX.Element;
