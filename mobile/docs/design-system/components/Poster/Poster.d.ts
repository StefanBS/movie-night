import * as React from "react";

/**
 * Film poster. Real TMDB image via `uri`; otherwise (and on error) a tile
 * tinted by `hue`, titled in Newsreader Italic when tall enough (h ≥ 104).
 */
export interface PosterProps {
  uri?: string | null;
  title?: string;
  year?: string | number;
  /** 0–360, stable per title (the caller derives it). @default 30 */
  hue?: number;
  /** @default 56 */
  w?: number;
  /** @default 84 */
  h?: number;
  style?: React.CSSProperties;
}

export function Poster(props: PosterProps): JSX.Element;
