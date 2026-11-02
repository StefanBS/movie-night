import React from "react";
import { Logomark } from "../core/Logomark.jsx";

/**
 * TopBar — app chrome in three kinds:
 *   home  — logomark + "Movie Night" + group name + right slot
 *   tab   — large left-aligned title + optional sub + right slot
 *   title — centered title + back link + right slot (pushed screens)
 */
export function TopBar({ kind = "tab", title, sub, group, back, right, style }) {
  const wrap = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", padding: "var(--space-2) var(--space-5)", minHeight: 52, ...style };
  if (kind === "home") {
    return (
      <div style={wrap}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Logomark size={22} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-heavy)", fontSize: 17, letterSpacing: "-0.02em", color: "var(--text-primary)", lineHeight: 1.1 }}>Movie Night</div>
            {group ? <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{group}</div> : null}
          </div>
        </div>
        {right}
      </div>
    );
  }
  if (kind === "tab") {
    return (
      <div style={{ ...wrap, alignItems: "flex-end", paddingTop: "var(--space-4)" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-heavy)", fontSize: "var(--text-3xl)", lineHeight: 1, letterSpacing: "var(--tracking-display)", color: "var(--text-primary)" }}>{title}</div>
          {sub ? <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 19, color: "var(--text-secondary)", marginTop: 6 }}>{sub}</div> : null}
        </div>
        {right}
      </div>
    );
  }
  return (
    <div style={{ ...wrap, position: "relative", justifyContent: "center" }}>
      {back ? (
        <button type="button" onClick={back.onClick} aria-label={"Back to " + back.label} style={{ position: "absolute", left: "var(--space-4)", display: "inline-flex", alignItems: "center", gap: 2, background: "none", border: "none", padding: 4, cursor: "pointer", color: "var(--text-primary)", fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: "var(--weight-semibold)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>{back.label}
        </button>
      ) : null}
      <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-bold)", fontSize: 17, letterSpacing: "-0.01em", color: "var(--text-primary)" }}>{title}</div>
      {right ? <div style={{ position: "absolute", right: "var(--space-4)" }}>{right}</div> : null}
    </div>
  );
}
