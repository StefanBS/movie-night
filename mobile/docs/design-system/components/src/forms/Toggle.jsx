import React from "react";

/** Toggle — 44×26 switch. Ember when on. */
export function Toggle({ value = false, onChange, label, disabled = false, style }) {
  return (
    <button
      type="button" role="switch" aria-checked={value} aria-label={label} disabled={disabled}
      onClick={() => onChange && onChange(!value)}
      style={{ position: "relative", width: 44, height: 26, flex: "none", padding: 0, border: "none", borderRadius: "var(--radius-full)", background: value ? "var(--accent)" : "var(--control-track-off)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, transition: "background var(--duration-base) var(--ease-standard)", ...style }}
    >
      <span style={{ position: "absolute", top: 3, left: 3, width: 20, height: 20, borderRadius: "50%", background: "var(--control-knob)", boxShadow: "var(--shadow-sm)", transform: value ? "translateX(18px)" : "none", transition: "transform var(--duration-base) var(--ease-out)" }}></span>
    </button>
  );
}
