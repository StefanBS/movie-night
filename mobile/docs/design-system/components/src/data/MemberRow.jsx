import React from "react";
import { Avatar, signatureColor } from "./Avatar.jsx";

/**
 * MemberRow — the core list row. Leading Avatar (or a signature dot when
 * `compact`), name, optional meta, trailing slot. `highlighted` marks the
 * picker with a heavier, larger name — no ring, fill or glow.
 */
export function MemberRow({ name, meta, trailing, leading, showAvatar = true, compact = false, highlighted = false, muted = false, divider = true, onClick, style, ...rest }) {
  const interactive = typeof onClick === "function";
  let lead = null;
  if (leading != null) lead = leading;
  else if (compact) lead = <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: signatureColor(name), flex: "none" }}></span>;
  else if (showAvatar) lead = <Avatar name={name} />;
  return (
    <div
      onClick={onClick} role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined}
      style={{
        display: "flex", alignItems: "center", gap: "var(--space-3)", padding: compact ? "12px 0" : "12px 0",
        borderBottom: divider ? "1px solid var(--border-hairline)" : "1px solid transparent",
        cursor: interactive ? "pointer" : "default", opacity: muted ? 0.55 : 1,
        transition: "opacity var(--duration-fast) var(--ease-standard)", WebkitTapHighlightColor: "transparent", ...style,
      }}
      onMouseDown={(e) => { if (interactive) e.currentTarget.style.opacity = "var(--pressed-opacity)"; }}
      onMouseUp={(e) => { if (interactive) e.currentTarget.style.opacity = muted ? "0.55" : "1"; }}
      onMouseLeave={(e) => { if (interactive) e.currentTarget.style.opacity = muted ? "0.55" : "1"; }}
      {...rest}
    >
      {lead}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: highlighted ? 20 : "var(--text-lg)", fontWeight: highlighted ? "var(--weight-heavy)" : "var(--weight-semibold)", letterSpacing: highlighted ? "var(--tracking-title)" : 0, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.25 }}>{name}</div>
        {meta != null && <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{meta}</div>}
      </div>
      {trailing != null && <div style={{ flex: "none", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{trailing}</div>}
    </div>
  );
}
