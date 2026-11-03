import * as React from "react";

/**
 * Home card for a scheduled night: countdown line, the film title as the
 * headline in upright serif ("Not picked yet." until chosen), a small
 * "Picked by Tomas" credit with the picker's avatar, who's coming, and
 * Start / Edit.
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
  /** Film title once chosen: the card's headline. */
  film?: string;
  /** Names of attendees. */
  coming?: string[];
  onStart?: () => void;
  onEdit?: () => void;
  style?: React.CSSProperties;
}

export function UpNextCard(props: UpNextCardProps): JSX.Element;
