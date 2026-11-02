import React from "react";
import { Avatar } from "../data/Avatar.jsx";
import { Button } from "../core/Button.jsx";

/**
 * UpNextCard — the home's scheduled-night card. The picker's first name is
 * the headline; the film (once chosen) is set in Newsreader Italic.
 */
export function UpNextCard({ date, countdown, time, picker, film, coming = [], onStart, onEdit, style }) {
  const first = (picker || "").trim().split(/\s+/)[0];
  return (
    <div style={{ background: "var(--surface-card)", borderRadius: "var(--radius-xl)", padding: "var(--space-6) var(--space-5) var(--space-5)", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--text-secondary)" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }}></span>
        <span>{[countdown, date, time].filter(Boolean).join(" · ")}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: "var(--space-4)" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-heavy)", fontSize: "var(--text-4xl)", lineHeight: "var(--leading-tight)", letterSpacing: "var(--tracking-display)", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{first}</div>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 26, lineHeight: 1.15, color: "var(--text-primary)", marginTop: 6 }}>{film ? film + "." : "picks the film."}</div>
        </div>
        <Avatar name={picker} size={48} />
      </div>
      {coming.length ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "var(--space-5)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--border-hairline)" }}>
          <div style={{ display: "flex" }}>{coming.slice(0, 4).map((n, i) => <Avatar key={n} name={n} size={26} style={{ marginLeft: i ? -8 : 0, boxShadow: "0 0 0 2px var(--surface-card)" }} />)}</div>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{coming.length} coming</span>
        </div>
      ) : null}
      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
        <Button onClick={onStart} style={{ flex: 1, minWidth: 0 }}>Start the night</Button>
        <Button variant="secondary" onClick={onEdit}>Edit</Button>
      </div>
    </div>
  );
}
