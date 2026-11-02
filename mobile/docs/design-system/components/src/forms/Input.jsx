import React from "react";

/** Input — single-line field on the card surface, 12px radius, ember focus ring. */
export function Input({ value, onChange, placeholder, invalid = false, disabled = false, addon, type = "text", style, ...rest }) {
  const [focused, setFocused] = React.useState(false);
  const ring = invalid ? "inset 0 0 0 1.5px var(--danger)" : focused ? "inset 0 0 0 1.5px var(--border-focus), var(--shadow-focus)" : "inset 0 0 0 1px var(--border-hairline)";
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: "var(--space-2)", width: "100%" }}>
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ flex: 1, minWidth: 0, height: 48, fontFamily: "var(--font-sans)", fontSize: "var(--text-base)", color: "var(--text-primary)", background: disabled ? "var(--surface-subtle)" : "var(--surface-card)", padding: "0 var(--space-4)", border: "none", borderRadius: "var(--radius-md)", outline: "none", boxShadow: ring, transition: "box-shadow var(--duration-fast) var(--ease-standard)", ...style }}
        {...rest}
      />
      {addon}
    </div>
  );
}
