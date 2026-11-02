import React from "react";

/**
 * Badge — small sentence-case status pill ("Next up", "Recorded", "Guest").
 * `solid` = filled ember (the picker only). Otherwise a tinted pill.
 */
export function Badge({ children, tone = "accent", solid = false, style }) {
  const tones = {
    accent: { bg: "var(--surface-spotlight)", fg: "var(--accent-strong)" },
    neutral: { bg: "var(--surface-subtle)", fg: "var(--text-secondary)" },
    muted: { bg: "transparent", fg: "var(--text-tertiary)", border: "1px solid var(--border-hairline)" },
    danger: { bg: "var(--surface-danger)", fg: "var(--text-danger)" },
    success: { bg: "var(--surface-success)", fg: "var(--success)" },
  };
  const t = solid ? { bg: "var(--accent)", fg: "var(--text-on-accent)" } : tones[tone] || tones.accent;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: "var(--radius-full)", background: t.bg, color: t.fg, border: t.border || "1px solid transparent", fontFamily: "var(--font-sans)", fontSize: "var(--text-caption)", fontWeight: "var(--weight-bold)", lineHeight: 1.2, letterSpacing: "var(--tracking-caption)", whiteSpace: "nowrap", ...style }}>
      {children}
    </span>
  );
}
