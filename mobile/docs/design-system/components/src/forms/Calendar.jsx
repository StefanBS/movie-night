import React from "react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["S", "M", "T", "W", "T", "F", "S"];
const pad = (n) => (n < 10 ? "0" + n : "" + n);
const chev = (d) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;

/**
 * Calendar — month date picker. Selected = ember disc; today = text-colour
 * ring; days with a night = small dot beneath; past days dimmed.
 * Presentational: the owner holds `value` and `month`.
 */
export function Calendar({ value, today, month, nightDates = [], onPick, onMonth, style }) {
  const nights = new Set(nightDates);
  const first = new Date(month.year, month.month - 1, 1).getDay();
  const days = new Date(month.year, month.month, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push({ d, iso: month.year + "-" + pad(month.month) + "-" + pad(d) });
  const navBtn = (dir, label, path) => (
    <button type="button" aria-label={label} onClick={() => onMonth && onMonth(dir)} style={{ width: 36, height: 36, border: "none", borderRadius: "50%", background: "var(--surface-subtle)", color: "var(--text-primary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{chev(path)}</button>
  );
  return (
    <div style={{ ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-heavy)", fontSize: "var(--text-xl)", letterSpacing: "var(--tracking-title)", color: "var(--text-primary)" }}>{MONTHS[month.month - 1]} <span style={{ color: "var(--text-tertiary)", fontWeight: "var(--weight-semibold)" }}>{month.year}</span></div>
        <div style={{ display: "flex", gap: 8 }}>{navBtn(-1, "Previous month", "m15 18-6-6 6-6")}{navBtn(1, "Next month", "m9 18 6-6-6-6")}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", rowGap: 2 }}>
        {WD.map((w, i) => <div key={i} style={{ textAlign: "center", fontFamily: "var(--font-sans)", fontSize: "var(--text-caption)", fontWeight: "var(--weight-semibold)", color: "var(--text-tertiary)", paddingBottom: 6 }}>{w}</div>)}
        {cells.map((c, i) => {
          if (!c) return <div key={"b" + i}></div>;
          const sel = c.iso === value, isToday = c.iso === today, past = today && c.iso < today, night = nights.has(c.iso);
          return (
            <button key={c.iso} type="button" aria-label={c.iso} aria-pressed={sel} onClick={() => onPick && onPick(c.iso)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "3px 0", background: "none", border: "none", cursor: "pointer" }}>
              <span style={{ width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", fontSize: "var(--text-base)", fontVariantNumeric: "tabular-nums", fontWeight: sel || isToday ? "var(--weight-bold)" : "var(--weight-regular)", background: sel ? "var(--accent)" : "transparent", color: sel ? "var(--text-on-accent)" : past ? "var(--text-tertiary)" : "var(--text-primary)", boxShadow: isToday && !sel ? "inset 0 0 0 1.5px var(--text-primary)" : "none" }}>{c.d}</span>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: night ? "var(--text-primary)" : "transparent" }}></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
