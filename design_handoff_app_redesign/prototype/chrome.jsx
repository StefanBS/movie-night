// Movie Night — app chrome & shared primitives for the redesigned screens.
// A purpose-built dark phone shell (the "cozy room"), an in-app top bar, a
// bottom tab bar (the navigation model the old 3 screens lacked), and an
// offline poster tile. All exported to window for the other screen files.

const DS = window.MovieNightDesignSystem_b54ad3;
const { Avatar, Badge } = DS;
const D = window.MNData;

const PHONE_W = 384, PHONE_H = 832;

// ── Phone bezel ────────────────────────────────────────────────
function Phone({ children, glow = false }) {
  return (
    <div style={{
      width: PHONE_W, height: PHONE_H, borderRadius: 46, flex: "none",
      position: "relative", overflow: "hidden",
      background: "var(--night-900)",
      boxShadow: "0 30px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(228,224,247,0.10), inset 0 0 0 6px #07060F",
      fontFamily: "var(--font-sans)",
    }}>
      {/* optional ember room-glow from the top */}
      {glow && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          background: "radial-gradient(78% 42% at 50% -4%, rgba(246,139,54,0.20), rgba(246,139,54,0) 60%)",
        }} />
      )}
      {/* status bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 50, zIndex: 30,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", paddingTop: 14, pointerEvents: "none",
      }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.01em" }}>9:41</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
          <svg width="17" height="11" viewBox="0 0 17 11" fill="none"><rect x="0" y="7" width="2.6" height="4" rx="0.6" fill="currentColor"/><rect x="4" y="4.6" width="2.6" height="6.4" rx="0.6" fill="currentColor"/><rect x="8" y="2.2" width="2.6" height="8.8" rx="0.6" fill="currentColor"/><rect x="12" y="0" width="2.6" height="11" rx="0.6" fill="currentColor" opacity="0.4"/></svg>
          <svg width="22" height="11" viewBox="0 0 24 12" fill="none"><rect x="0.5" y="0.5" width="20" height="11" rx="3" stroke="currentColor" strokeOpacity="0.45" fill="none"/><rect x="2" y="2" width="15" height="8" rx="1.6" fill="currentColor"/><rect x="21.5" y="3.6" width="1.8" height="4.8" rx="0.9" fill="currentColor" opacity="0.6"/></svg>
        </div>
      </div>
      {/* dynamic island */}
      <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", width: 112, height: 32, borderRadius: 18, background: "#07060F", zIndex: 40 }} />
      {/* content */}
      <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
      {/* home indicator */}
      <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", width: 128, height: 5, borderRadius: 100, background: "rgba(241,238,250,0.32)", zIndex: 45 }} />
    </div>
  );
}

// ── In-app top bar ─────────────────────────────────────────────
// kind="home" → wordmark + group + gear ; kind="title" → back + centered serif
function TopBar({ kind = "title", title, group, back = "Tonight", right }) {
  if (kind === "home") {
    return (
      <div style={{ paddingTop: 54, padding: "54px 20px 6px", position: "relative", zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <img src="../../assets/logomark.svg" alt="" style={{ width: 30, height: 30, flex: "none" }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, lineHeight: 1, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)" }}>Movie Night</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", letterSpacing: "0.04em", marginTop: 3 }}>{group}</div>
            </div>
          </div>
          {right}
        </div>
      </div>
    );
  }
  if (kind === "tab") {
    return (
      <div style={{ padding: "56px 20px 6px", position: "relative", zIndex: 20, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 34, lineHeight: 1, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)" }}>{title}</div>
          {group && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", letterSpacing: "0.04em", marginTop: 7 }}>{group}</div>}
        </div>
        {right}
      </div>
    );
  }
  return (
    <div style={{
      paddingTop: 54, padding: "54px 12px 8px", position: "relative", zIndex: 20,
      display: "flex", alignItems: "center", justifyContent: "center", minHeight: 44,
    }}>
      <div style={{ position: "absolute", left: 10, top: 50, display: "inline-flex", alignItems: "center", gap: 2, color: "var(--accent-strong)", fontSize: 15, fontWeight: 600 }}>
        <svg width="9" height="16" viewBox="0 0 11 18" fill="none"><path d="M9.5 1.5L2 9l7.5 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        {back}
      </div>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)", whiteSpace: "nowrap" }}>{title}</span>
      {right && <div style={{ position: "absolute", right: 12, top: 48 }}>{right}</div>}
    </div>
  );
}

// ── Bottom tab bar ─────────────────────────────────────────────
const TABS = [
  { id: "tonight", label: "Tonight", icon: "clapperboard" },
  { id: "history", label: "History", icon: "history" },
  { id: "club",    label: "The Club", icon: "users-round" },
  { id: "settings",label: "Settings", icon: "settings" },
];
function TabBar({ active }) {
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25,
      paddingTop: 8, paddingBottom: 26,
      display: "flex", justifyContent: "space-around", alignItems: "flex-end",
      background: "rgba(12,10,27,0.86)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      borderTop: "1px solid var(--border-hairline)",
    }}>
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <div key={t.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 64 }}>
            <i data-lucide={t.icon} style={{ width: 23, height: 23, color: on ? "var(--accent-strong)" : "var(--text-tertiary)" }}></i>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: on ? 700 : 500, color: on ? "var(--accent-strong)" : "var(--text-tertiary)" }}>{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Scroll body ────────────────────────────────────────────────
function Screen({ children, pad = true, tabbar = true, style }) {
  return (
    <div style={{ flex: 1, overflow: "auto", position: "relative", zIndex: 10, ...style }}>
      <div style={{ padding: pad ? "8px 20px 0" : 0, paddingBottom: tabbar ? 112 : 28 }}>{children}</div>
    </div>
  );
}

// ── Mono section label ─────────────────────────────────────────
function SectionLabel({ children, style }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
      color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "var(--tracking-caption)",
      marginTop: 22, marginBottom: 10, ...style,
    }}>{children}</div>
  );
}

// ── Offline poster tile ────────────────────────────────────────
function Poster({ id, w = 56, h = 84, radius = "var(--radius-sm)", showTitle = "auto", style }) {
  const m = (id && D.movies[id]) || { title: "—", year: "", hue: 250 };
  const hue = m.hue ?? 250;
  const withTitle = showTitle === true || (showTitle === "auto" && h >= 104);
  return (
    <div style={{
      width: w, height: h, borderRadius: radius, flex: "none", position: "relative", overflow: "hidden",
      background: `linear-gradient(155deg, hsl(${hue} 42% 17%), hsl(${hue} 48% 8%))`,
      boxShadow: "inset 0 0 0 1px var(--border-hairline)", ...style,
    }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(70% 45% at 50% 8%, hsl(${hue} 70% 60% / 0.28), transparent 70%)` }} />
      {withTitle ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "16px 9px 9px", background: "linear-gradient(transparent, rgba(7,6,15,0.6))" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: Math.max(13, Math.min(19, w / 6)), lineHeight: 1.05, color: "var(--haze-100)", letterSpacing: "var(--tracking-display)" }}>{m.title}</div>
          {m.year && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--haze-300)", marginTop: 3 }}>{m.year}</div>}
        </div>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          <i data-lucide="film" style={{ width: 16, height: 16, color: "rgba(241,238,250,0.4)" }}></i>
        </div>
      )}
    </div>
  );
}

// ── Mono stat ──────────────────────────────────────────────────
function Stat({ value, label, accent = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: accent ? "var(--accent-strong)" : "var(--text-primary)", letterSpacing: "-0.01em" }}>{value}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "var(--tracking-caption)" }}>{label}</span>
    </div>
  );
}

// Reaction → glyph + tone
const REACTIONS = {
  loved: { glyph: "✦", label: "Loved it" },
  liked: { glyph: "✓", label: "Liked it" },
  okay:  { glyph: "·", label: "It was fine" },
};

// ── Calendar date picker (the scheduling control) ──────────────
function Calendar({ value, month, onPick, onMonth }) {
  const y = month.getFullYear(), mi = month.getMonth();
  const first = new Date(y, mi, 1).getDay();
  const days = new Date(y, mi + 1, 0).getDate();
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${y}-${pad(mi + 1)}-${pad(d)}`;
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  const Chev = ({ dir }) => (
    <div onClick={() => onMonth(dir)} style={{ width: 34, height: 34, borderRadius: "var(--radius-md)", display: "grid", placeItems: "center", cursor: "pointer", background: "var(--surface-card)", border: "1px solid var(--border-hairline)" }}>
      <i data-lucide={dir < 0 ? "chevron-left" : "chevron-right"} style={{ width: 17, height: 17, color: "var(--text-secondary)" }}></i>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)" }}>
          {["January","February","March","April","May","June","July","August","September","October","November","December"][mi]} {y}
        </div>
        <div style={{ display: "flex", gap: 8 }}><Chev dir={-1} /><Chev dir={1} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 6 }}>
        {["S","M","T","W","T","F","S"].map((w, i) => (
          <div key={i} style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", padding: "4px 0" }}>{w}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const id = iso(d);
          const sel = id === value;
          const today = id === D.today;
          const hasNight = D.nightDates.has(id) && !sel;
          const past = D.daysUntil(id) < 0;
          return (
            <div key={i} onClick={() => onPick(id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "5px 0", cursor: "pointer" }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center",
                fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: sel ? 700 : 500,
                background: sel ? "var(--accent)" : "transparent",
                color: sel ? "var(--text-on-accent)" : past ? "var(--text-tertiary)" : "var(--text-primary)",
                boxShadow: sel ? "0 2px 12px rgba(246,139,54,0.45)" : today ? "inset 0 0 0 1.5px var(--accent-strong)" : "none",
              }}>{d}</div>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: hasNight ? "var(--accent-strong)" : "transparent" }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Small inline date chip (e.g. an editable date on the attendance header)
function DateChip({ children, accent = false }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: "var(--radius-full)",
      background: accent ? "var(--surface-spotlight)" : "var(--surface-card)",
      boxShadow: accent ? "inset 0 0 0 1px var(--accent-glow)" : "inset 0 0 0 1px var(--border-hairline)",
      fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: accent ? "var(--accent-strong)" : "var(--text-secondary)",
    }}>
      <i data-lucide="calendar" style={{ width: 14, height: 14 }}></i>{children}
    </span>
  );
}

Object.assign(window, {
  Phone, TopBar, TabBar, Screen, SectionLabel, Poster, Stat,
  Calendar, DateChip,
  PHONE_W, PHONE_H, REACTIONS,
});
