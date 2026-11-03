import * as React from "react";

/**
 * Home card for a scheduled night: countdown line, the film (poster beside
 * the title in upright serif (never cut), then year, genres and length on a line each; an empty poster
 * slot and "Not picked yet." until chosen), a small "Picked by Tomas" credit
 * with the picker's avatar, who's coming, then one main button that follows
 * the night ("Choose the film" → "We watched it" → none while it's ahead) and "Edit".
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
  /** TMDB poster URL. Without it (or on error) the Poster falls back to a hue tile. */
  posterUri?: string | null;
  /** 0–360 hue for the fallback tile, stable per title. @default 30 */
  hue?: number;
  /** Release year, e.g. 2000. */
  year?: string | number;
  /** Genre or genres, e.g. "Drama" or ["Drama", "Romance"]. Shown as one line under the year; cut with "…" if it runs long. */
  genre?: string | string[];
  /** Running time, e.g. "1h 38m". */
  runtime?: string;
  /** Names of attendees. */
  coming?: string[];
  /** True when the night is today, or has passed without being saved. With a film chosen, the main button becomes "We watched it". @default false */
  due?: boolean;
  /** "Choose the film": the main button while no film is chosen. Opens the picker's film search. */
  onChooseFilm?: () => void;
  /** "We watched it": the main button once a film is chosen and the night is due. Confirms who came, saves the night to Watched and moves the rotation on. */
  onWatched?: () => void;
  /** Tapping the card (outside the buttons) opens the night. */
  onOpen?: () => void;
  /** "Edit": always shown, as the secondary button. */
  onEdit?: () => void;
  style?: React.CSSProperties;
}

export function UpNextCard(props: UpNextCardProps): JSX.Element;
