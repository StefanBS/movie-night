import * as React from "react";

/**
 * Home card for a scheduled night: countdown line, the picker's first name
 * as the headline, "picks the film." (or the chosen film) in italic serif,
 * who's coming, and Start / Edit.
 */
export interface UpNextCardProps {
  /** e.g. "Fri 19 Jun". */
  date?: string;
  /** e.g. "In 3 days", "Tonight". */
  countdown?: string;
  /** e.g. "8 pm". */
  time?: string;
  /** Picker's full name. */
  picker: string;
  /** Film title once chosen. */
  film?: string;
  /** Names of attendees. */
  coming?: string[];
  onStart?: () => void;
  onEdit?: () => void;
  style?: React.CSSProperties;
}

export function UpNextCard(props: UpNextCardProps): JSX.Element;
