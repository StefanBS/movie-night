import React from "react";

/** SectionLabel — small sentence-case group heading. Replaces the old mono uppercase label. */
export function SectionLabel({ children, style }) {
  return <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: "var(--weight-semibold)", color: "var(--text-secondary)", margin: "var(--space-6) 0 var(--space-2)", ...style }}>{children}</div>;
}
