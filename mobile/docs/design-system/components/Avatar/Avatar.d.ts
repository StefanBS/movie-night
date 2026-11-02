import * as React from "react";

/**
 * Initials chip on the member's signature colour. The colour is derived from
 * the name with the app's hash, so a person is always the same colour.
 * Avatars never mark the picker — that's the name's job.
 */
export interface AvatarProps {
  name?: string;
  /** Keyword or px. sm 28 · md 40 · lg 56. @default "md" */
  size?: "sm" | "md" | "lg" | number;
  style?: React.CSSProperties;
}

export function Avatar(props: AvatarProps): JSX.Element;
