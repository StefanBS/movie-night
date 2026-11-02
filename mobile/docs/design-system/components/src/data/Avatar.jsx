import React from "react";

const SIZES = { sm: 28, md: 40, lg: 56 };

/** Same hash as the app's lib/avatar.ts: sum of char codes mod 7. */
export function signatureIndex(name = "") {
  const key = name.trim();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h + key.charCodeAt(i)) % 7;
  return h;
}
export function signatureColor(name) { return "var(--sig-" + (signatureIndex(name) + 1) + ")"; }

function initials(name = "") {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return w.length ? w.slice(0, 2).map((x) => x[0]).join("").toUpperCase() : "?";
}

/**
 * Avatar — a member's initials on their signature colour (--sig-1…7, hashed
 * from the name). No ring or accent: the picker is marked by type, not the avatar.
 */
export function Avatar({ name = "", size = "md", style }) {
  const px = typeof size === "number" ? size : SIZES[size] || 40;
  return (
    <div
      aria-hidden="true"
      style={{
        width: px, height: px, flex: "none", borderRadius: "var(--radius-full)", background: signatureColor(name),
        color: "var(--text-on-sig)", display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-sans)", fontWeight: "var(--weight-bold)", fontSize: Math.round(px * 0.36), lineHeight: 1, letterSpacing: "-0.01em",
        ...style,
      }}
    >
      {initials(name)}
    </div>
  );
}
