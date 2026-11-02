import * as React from "react";

/**
 * Month date picker for the "When" step. Selected day = ember disc, today =
 * ring, days that already have a night = dot. Presentational only.
 */
export interface CalendarProps {
  /** Selected ISO date (YYYY-MM-DD). */
  value?: string;
  /** Today's ISO date. */
  today?: string;
  /** Month shown; `month` is 1–12. */
  month: { year: number; month: number };
  /** ISO dates that already have a night. */
  nightDates?: string[];
  onPick?: (iso: string) => void;
  onMonth?: (dir: -1 | 1) => void;
  style?: React.CSSProperties;
}

export function Calendar(props: CalendarProps): JSX.Element;
