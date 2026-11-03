import React from "react";

/**
 * Stepper — the new-night wizard's progress: four segments with labels.
 * Done segments are solid text colour, the current one ember, the rest hairline.
 */
export function Stepper({ current = 0, steps = ["Date", "People", "Movie", "Done"], style }) {
  return (
    <div role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={current + 1} style={{ display: "grid", gridTemplateColumns: "repeat(" + steps.length + ", minmax(0,1fr))", gap: 6, ...style }}>
      {steps.map((label, i) => {
        const on = i === current, done = i < current;
        return (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ height: 3, borderRadius: 2, background: on ? "var(--accent)" : done ? "var(--text-primary)" : "var(--border-strong)" }}></div>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: on ? "var(--weight-bold)" : "var(--weight-medium)", color: on || done ? "var(--text-primary)" : "var(--text-tertiary)" }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
