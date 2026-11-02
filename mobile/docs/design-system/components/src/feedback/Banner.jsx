import React from "react";

/** Banner — inline message strip for screen-level hints and errors. */
export function Banner({ children, tone = "info", style, ...rest }) {
  const tones = {
    danger: { color: "var(--text-danger)", bg: "var(--surface-danger)" },
    info: { color: "var(--text-secondary)", bg: "var(--surface-subtle)" },
    success: { color: "var(--success)", bg: "var(--surface-success)" },
  };
  const t = tones[tone] || tones.info;
  return (
    <div role={tone === "danger" ? "alert" : "status"} style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", lineHeight: "var(--leading-normal)", color: t.color, background: t.bg, borderRadius: "var(--radius-md)", padding: "var(--space-3) var(--space-4)", textWrap: "pretty", ...style }} {...rest}>
      {children}
    </div>
  );
}
