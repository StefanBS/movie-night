import React from "react";

/**
 * SettingsRow — label, optional value, optional right node (Toggle/chevron).
 * Grouping (card + dividers) is the caller's job.
 */
export function SettingsRow({ label, value, right, onClick, disabled = false, danger = false, divider = false, style }) {
  const interactive = typeof onClick === "function" && !disabled;
  return (
    <div
      onClick={interactive ? onClick : undefined} role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined}
      style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minHeight: 52, padding: "0 var(--space-4)", borderBottom: divider ? "1px solid var(--border-hairline)" : "none", opacity: disabled ? 0.45 : 1, cursor: interactive ? "pointer" : "default", ...style }}
      onMouseDown={(e) => { if (interactive) e.currentTarget.style.opacity = "var(--pressed-opacity)"; }}
      onMouseUp={(e) => { if (interactive) e.currentTarget.style.opacity = "1"; }}
      onMouseLeave={(e) => { if (interactive) e.currentTarget.style.opacity = "1"; }}
    >
      <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-sans)", fontSize: "var(--text-base)", fontWeight: "var(--weight-medium)", color: danger ? "var(--text-danger)" : "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {value ? <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</span> : null}
      {right ? <span style={{ display: "inline-flex", color: "var(--text-tertiary)" }}>{right}</span> : null}
    </div>
  );
}
