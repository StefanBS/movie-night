import React from "react";

/**
 * Button — pill-shaped action control.
 * primary = ember fill, ink label (the main action; one per screen)
 * secondary = hairline outline, primary-text label
 * ghost = no chrome, secondary-text label (e.g. "Skip turn")
 * danger = no chrome, red label
 */
export function Button({ children, variant = "primary", size = "md", disabled = false, fullWidth = false, type = "button", onClick, style, ...rest }) {
  const pad = size === "sm" ? "8px 16px" : size === "lg" ? "17px 28px" : "13px 22px";
  const fontSize = size === "sm" ? "var(--text-sm)" : "var(--text-base)";
  const variants = {
    primary: { background: "var(--accent)", color: "var(--text-on-accent)", border: "1px solid transparent" },
    secondary: { background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border-strong)" },
    ghost: { background: "transparent", color: "var(--text-secondary)", border: "1px solid transparent" },
    danger: { background: "transparent", color: "var(--text-danger)", border: "1px solid transparent" },
  };
  const ghostLike = variant === "ghost" || variant === "danger";
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "var(--space-2)",
        width: fullWidth ? "100%" : "auto", padding: ghostLike ? (size === "sm" ? "8px 4px" : "13px 6px") : pad,
        fontFamily: "var(--font-sans)", fontSize, fontWeight: "var(--weight-bold)", lineHeight: 1, whiteSpace: "nowrap", flex: "none",
        borderRadius: "var(--radius-full)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
        transition: "opacity var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)",
        WebkitTapHighlightColor: "transparent", ...variants[variant], ...style,
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.opacity = "var(--pressed-opacity)"; }}
      onMouseUp={(e) => { if (!disabled) e.currentTarget.style.opacity = "1"; }}
      onMouseEnter={(e) => {
        if (disabled) return;
        if (variant === "primary") e.currentTarget.style.background = "var(--accent-hover)";
        if (variant === "ghost") e.currentTarget.style.color = "var(--text-primary)";
        if (variant === "secondary") e.currentTarget.style.background = "var(--surface-subtle)";
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.opacity = "1";
        e.currentTarget.style.background = variants[variant].background;
        e.currentTarget.style.color = variants[variant].color;
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
