import React from "react";
import { Avatar } from "../data/Avatar.jsx";
import { Button } from "../core/Button.jsx";

/**
 * UpNextCard — the home's scheduled-night card. The film is the headline,
 * set large in Newsreader (upright, medium); the picker is a quiet credit line under it
 * ("Picked by Tomas"). Before the film is chosen, the headline slot holds
 * "Not picked yet." in tertiary text and the credit reads "Tomas is picking".
 */
export function UpNextCard({ date, countdown, time, picker, film, coming = [], onStart, onEdit, style }) {
  const first = (picker || "").trim().split(/\s+/)[0];
  return (
    <div style={{ background: "var(--surface-card)", borderRadius: "var(--radius-xl)", padding: "var(--space-6) var(--space-5) var(--space-5)", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--text-secondary)" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }}></span>
        <span>{[countdown, date, time].filter(Boolean).join(" · ")}</span>
      </div>
      <div style={{ fontFamily: "var(--font-serif)", fontWeight: "var(--weight-medium)", fontSize: "var(--text-3xl)", lineHeight: 1.05, letterSpacing: "-0.015em", color: film ? "var(--text-primary)" : "var(--text-tertiary)", marginTop: "var(--space-4)", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{film ? film : "Not picked yet."}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-4)", fontFamily: "var(--font-sans)", fontSize: "var(--text-base)", color: "var(--text-secondary)", minWidth: 0 }}>
        <Avatar name={picker} size={28} />
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {film ? <>Picked by <strong style={{ fontWeight: "var(--weight-semibold)", color: "var(--text-primary)" }}>{first}</strong></> : <><strong style={{ fontWeight: "var(--weight-semibold)", color: "var(--text-primary)" }}>{first}</strong> is picking</>}
        </span>
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
