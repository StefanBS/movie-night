import React from "react";

/**
 * Logomark — the Movie Night mark: a calendar page with an ember play button.
 * The film is the plan for the day. Frame takes currentColor; the play
 * button is always --accent. `tile` renders the app-icon tile.
 * Centred on the calendar body: the two binder tabs sit above the optical
 * centre, so the square, not the whole silhouette, is what centres.
 */
export function Logomark({ size = 32, tile = false, style }) {
  const mark = (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ display: "block" }}>
      <rect x="4.5" y="5.5" width="23" height="21" rx="4.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M11 2.5v5.5M21 2.5v5.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M12.2 10.7v9.6a.8.8 0 0 0 1.2.7l7.6-4.8a.8.8 0 0 0 0-1.4l-7.6-4.8a.8.8 0 0 0-1.2.7Z" fill="var(--accent)" />
    </svg>
  );
  if (!tile) return <span role="img" aria-label="Movie Night" style={{ display: "inline-flex", color: "var(--text-primary)", ...style }}>{mark}</span>;
  const t = size * 1.9;
  return (
    <span role="img" aria-label="Movie Night" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: t, height: t, borderRadius: t * 0.225, background: "var(--ink-950)", color: "var(--ink-100)", ...style }}>
      {mark}
    </span>
  );
}
