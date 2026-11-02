import React from "react";

/** Stat — a big tabular number over a small sentence-case label. `accent` = ember value. */
export function Stat({ value, label, accent = false, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, ...style }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-heavy)", fontSize: 30, lineHeight: 1, letterSpacing: "var(--tracking-title)", fontVariantNumeric: "tabular-nums", color: accent ? "var(--accent-strong)" : "var(--text-primary)" }}>{value}</div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{label}</div>
    </div>
  );
}
