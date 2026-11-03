import React from "react";

/* Lucide icons (ISC licence), 24px grid, drawn in currentColor. Functions, so
   nothing renders before React has loaded. */
const Glyph = ({ children }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
export const TAB_ICONS = {
  clapperboard: () => <Glyph><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" /><path d="m6.2 5.3 3.1 3.9" /><path d="m12.4 3.4 3.1 4" /><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></Glyph>,
  "calendar-days": () => <Glyph><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /><path d="M8 18h.01" /><path d="M12 18h.01" /><path d="M16 18h.01" /></Glyph>,
  library: () => <Glyph><path d="m16 6 4 14" /><path d="M12 6v14" /><path d="M8 8v12" /><path d="M4 4v16" /></Glyph>,
  "users-round": () => <Glyph><path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" /><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" /></Glyph>,
};

export const DEFAULT_TABS = [
  { id: "tonight", label: "Tonight", icon: "clapperboard" },
  { id: "upcoming", label: "Upcoming", icon: "calendar-days" },
  { id: "watched", label: "Watched", icon: "library" },
  { id: "club", label: "Club", icon: "users-round" },
];

/**
 * TabBar — the app's bottom navigation: Tonight · Upcoming · Watched · Club.
 * Translucent bar with a top hairline; 24px Lucide icon over a 12px label.
 * Active = text-primary + semibold label; inactive = text-secondary.
 * Never ember: the accent stays with the picker and the primary action.
 * Settings lives behind the gear in the top bar, not here.
 */
export function TabBar({ active = "tonight", onChange, tabs = DEFAULT_TABS, style }) {
  return (
    <nav aria-label="Main" style={{ display: "flex", justifyContent: "space-around", padding: "var(--space-2) var(--space-2) var(--space-6)", background: "var(--surface-tab-bar)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderTop: "1px solid var(--border-hairline)", ...style }}>
      {tabs.map((t) => {
        const on = t.id === active;
        const icon = typeof t.icon === "string" ? (TAB_ICONS[t.icon] ? TAB_ICONS[t.icon]() : null) : t.icon;
        return (
          <button key={t.id} type="button" aria-current={on ? "page" : undefined} onClick={onChange ? () => onChange(t.id) : undefined}
            style={{ flex: "1 1 0", minWidth: 0, minHeight: 48, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--space-1)", background: "none", border: "none", padding: "var(--space-1) 0", cursor: "pointer", color: on ? "var(--text-primary)" : "var(--text-secondary)", transition: "color var(--duration-fast) var(--ease-out)" }}>
            {icon}
            <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-caption)", lineHeight: 1.2, fontWeight: on ? "var(--weight-semibold)" : "var(--weight-medium)" }}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
