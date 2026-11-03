import React from "react";
import { Avatar } from "../data/Avatar.jsx";
import { Button } from "../core/Button.jsx";
import { Poster } from "../data/Poster.jsx";

/**
 * UpNextCard — the home's scheduled-night card. The film leads: its poster
 * (88×132) beside the title in Newsreader (upright, medium, 30px), always shown
 * in full, then year, genres and length on a line each. The picker is a quiet credit line under it
 * ("Picked by Tomas"). Before the film is chosen, an empty poster slot sits
 * beside "Not picked yet." in tertiary text and the credit reads "Tomas is picking".
 *
 * The main button is the next thing the group has to do, so it changes with
 * the night: no film yet → "Choose the film"; film chosen and the night is
 * today (or passed unsaved) → "We watched it"; film chosen, night still ahead
 * → no main button, just "Edit" (tap the card to open the night).
 */
export function UpNextCard({ date, countdown, time, picker, film, posterUri, hue = 30, year, genre, runtime, coming = [], due = false, onChooseFilm, onWatched, onOpen, onEdit, style }) {
  const first = (picker || "").trim().split(/\s+/)[0];
  // Under the title, one detail per line: year, genres (cut with "…" if the
  // list runs long), length.
  const genres = Array.isArray(genre) ? genre.filter(Boolean).join(", ") : genre;
  const main = !film ? { label: "Choose the film", onClick: onChooseFilm } : due ? { label: "We watched it", onClick: onWatched } : null;
  return (
    <div onClick={onOpen} style={{ background: "var(--surface-card)", borderRadius: "var(--radius-xl)", padding: "var(--space-6) var(--space-5) var(--space-5)", cursor: onOpen ? "pointer" : undefined, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--text-secondary)" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }}></span>
        <span>{[countdown, date, time].filter(Boolean).join(" · ")}</span>
      </div>
      <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-end", marginTop: "var(--space-4)" }}>
        {film
          ? <Poster uri={posterUri} title={film} year={year} hue={hue} w={88} h={132} style={{ boxShadow: "var(--shadow-sm)" }} />
          : <div style={{ width: 88, height: 132, flex: "none", borderRadius: "var(--radius-sm)", boxShadow: "inset 0 0 0 1.5px var(--border-strong)" }}></div>}
        <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontWeight: "var(--weight-medium)", fontSize: "var(--text-2xl)", lineHeight: 1.08, letterSpacing: "-0.015em", color: film ? "var(--text-primary)" : "var(--text-tertiary)", overflowWrap: "break-word", hyphens: "auto" }}>{film ? film : "Not picked yet."}</div>
          {film && (year || genres || runtime) ? (
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", lineHeight: 1.4, color: "var(--text-tertiary)", marginTop: "var(--space-2)", fontVariantNumeric: "tabular-nums", minWidth: 0 }}>
              {[year, genres, runtime].filter(Boolean).map((v, k) => (
                <div key={k} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{String(v)}</div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
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
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
        {main ? <Button onClick={main.onClick} style={{ flex: 1, minWidth: 0 }}>{main.label}</Button> : null}
        <Button variant="secondary" onClick={onEdit}>Edit</Button>
      </div>
    </div>
  );
}
