import * as React from "react";

/**
 * The core list row — member, attendee, queue entry. Avatar (or a signature
 * dot when `compact`), name, meta line, trailing slot. `highlighted` marks
 * the picker: heavier, larger name. No rings, fills or glows.
 */
export interface MemberRowProps {
  name: string;
  /** Line under the name, e.g. "2 picks · last May 22". */
  meta?: React.ReactNode;
  /** Trailing content — Badge, count, Toggle, chevron. */
  trailing?: React.ReactNode;
  /** Replace the leading avatar/dot (e.g. a queue number). */
  leading?: React.ReactNode;
  /** @default true */
  showAvatar?: boolean;
  /** Signature dot instead of avatar — dense lists. @default false */
  compact?: boolean;
  /** The picker. @default false */
  highlighted?: boolean;
  /** Inactive member. @default false */
  muted?: boolean;
  /** Hairline beneath. @default true */
  divider?: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;
}

export function MemberRow(props: MemberRowProps): JSX.Element;
