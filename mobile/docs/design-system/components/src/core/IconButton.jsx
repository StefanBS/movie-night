import React from "react";

/**
 * IconButton — round, borderless tap target for a single icon (pass the glyph
 * as children). `filled` gives it a subtle surface, for top-bar actions.
 */
export function IconButton({ children, size = "md", label, filled = false, disabled = false, onClick, style, ...rest }) {
  const dim = size === "sm" ? 32 : 40;
  const bg = filled ? "var(--surface-subtle)" : "transparent";
  return (
    <button
      type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", width: dim, height: dim, padding: 0,
        color: "var(--text-secondary)", background: bg, border: "none", borderRadius: "var(--radius-full)",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
        transition: "background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)",
        WebkitTapHighlightColor: "transparent", ...style,
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = "var(--surface-raised)"; e.currentTarget.style.color = "var(--text-primary)"; } }}
      onMouseLeave={(e) => { e.currentTarget.style.background = bg; e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.opacity = "1"; }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.opacity = "var(--pressed-opacity)"; }}
      onMouseUp={(e) => { if (!disabled) e.currentTarget.style.opacity = "1"; }}
      {...rest}
    >
      {children}
    </button>
  );
}
