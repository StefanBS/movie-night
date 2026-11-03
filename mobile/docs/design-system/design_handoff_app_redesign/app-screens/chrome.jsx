// Movie Night — app chrome & shared primitives · "Spotlight, refined".
// Theme-aware phone shell (dark/light follow the nearest data-theme), top bar,
// tab bar, and thin wrappers over design-system components.

const DS = window.MovieNightDesignSystem_b54ad3;
const D = window.MNData;

const PHONE_W = 384, PHONE_H = 832;

// ── Phone bezel ────────────────────────────────────────────────
function Phone({ children }) {
  return (
    <div style={{
      width: PHONE_W, height: PHONE_H, borderRadius: 46, flex: "none", position: "relative", overflow: "hidden",
      background: "var(--surface-page)", color: "var(--text-primary)",
      boxShadow: "0 30px 70px rgba(0,0,0,0.35), 0 0 0 1px var(--border-hairline)",
      fontFamily: "var(--font-sans)",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 50, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px 0", pointerEvents: "none" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>9:41</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
          <svg width="17" height="11" viewBox="0 0 17 11" fill="none"><rect x="0" y="7" width="2.6" height="4" rx="0.6" fill="currentColor"/><rect x="4" y="4.6" width="2.6" height="6.4" rx="0.6" fill="currentColor"/><rect x="8" y="2.2" width="2.6" height="8.8" rx="0.6" fill="currentColor"/><rect x="12" y="0" width="2.6" height="11" rx="0.6" fill="currentColor" opacity="0.4"/></svg>
          <svg width="22" height="11" viewBox="0 0 24 12" fill="none"><rect x="0.5" y="0.5" width="20" height="11" rx="3" stroke="currentColor" strokeOpacity="0.45" fill="none"/><rect x="2" y="2" width="15" height="8" rx="1.6" fill="currentColor"/><rect x="21.5" y="3.6" width="1.8" height="4.8" rx="0.9" fill="currentColor" opacity="0.6"/></svg>
        </div>
      </div>
      <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", width: 112, height: 32, borderRadius: 18, background: "#0A0908", zIndex: 40 }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column" }}>{children}</div>
      <div style={{ position: "absolute", inset: 0, borderRadius: 46, boxShadow: "inset 0 0 0 6px #0A0908", zIndex: 60, pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", width: 128, height: 5, borderRadius: 100, background: "var(--text-primary)", opacity: 0.3, zIndex: 45 }} />
    </div>
  );
}

// ── Top bar ────────────────────────────────────────────────────
// home → mark + wordmark + group ; tab → big title + serif sub ; title → back + centered title
function TopBar({ kind = "title", title, group, back = "Tonight", right }) {
  if (kind === "home") {
    return (
      <div style={{ padding: "56px 20px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <DS.Logomark size={24} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Movie Night</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{group}</div>
          </div>
        </div>
        {right}
      </div>
    );
  }
  if (kind === "tab") {
    return (
      <div style={{ padding: "60px 20px 4px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", position: "relative", zIndex: 20 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 40, lineHeight: 1, letterSpacing: "-0.045em" }}>{title}</div>
          {group && <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 18, color: "var(--text-secondary)", marginTop: 6 }}>{group}</div>}
        </div>
        {right}
      </div>
    );
  }
  return (
    <div style={{ padding: "54px 12px 8px", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 20 }}>
      {back && (
        <div style={{ position: "absolute", left: 12, top: 56, display: "inline-flex", alignItems: "center", gap: 2, color: "var(--text-primary)", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>{back}
        </div>
      )}
      <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>{title}</span>
      {right && <div style={{ position: "absolute", right: 14, top: 54 }}>{right}</div>}
    </div>
  );
}

// ── Tab bar (the design system's TabBar, pinned to the bottom of the phone) ──
// Tonight · Upcoming · Watched · Club. Settings is behind the gear on Tonight.
function TabBar({ active }) {
  return <DS.TabBar active={active} style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25, paddingBottom: 28 }} />;
}

// ── Scroll body ────────────────────────────────────────────────
function Screen({ children, pad = true, tabbar = true, style }) {
  return (
    <div style={{ flex: 1, overflow: "auto", position: "relative", zIndex: 10, ...style }}>
      <div style={{ padding: pad ? "8px 20px 0" : 0, paddingBottom: tabbar ? 112 : 150 }}>{children}</div>
    </div>
  );
}

// ── Sticky footer for flow screens ─────────────────────────────
// Solid page fill with a hairline on top, so scrolled content never shows
// through the summary line or the buttons.
function Footer({ children }) {
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25, padding: "14px 20px 32px", background: "var(--surface-page)", borderTop: "1px solid var(--border-hairline)", display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
  );
}

function SectionLabel({ children, style }) {
  return <DS.SectionLabel style={style}>{children}</DS.SectionLabel>;
}

// ── Poster (offline tile; title in Newsreader when tall) ─
function Poster({ id, w = 56, h = 84, radius = "var(--radius-sm)", showTitle = "auto", style }) {
  const m = (id && D.movies[id]) || { title: "—", year: "", hue: 30 };
  const withTitle = showTitle === true || (showTitle === "auto" && h >= 104);
  return (
    <DS.Poster title={withTitle ? m.title : ""} year={withTitle ? m.year : ""} hue={m.hue ?? 30} w={w} h={h} style={{ borderRadius: radius, ...style }} />
  );
}

function Stat({ value, label, accent = false }) {
  return <DS.Stat value={value} label={label} accent={accent} />;
}

const REACTIONS = {
  loved: { glyph: "♥", label: "Loved it" },
  liked: { glyph: "✓", label: "Liked it" },
  okay: { glyph: "·", label: "It was fine" },
};

// ── Calendar (wraps the DS month picker) ───────────────────────
function Calendar({ value, month, onPick, onMonth }) {
  return (
    <DS.Calendar value={value} today={D.today} month={{ year: month.getFullYear(), month: month.getMonth() + 1 }} nightDates={[...D.nightDates].filter((d) => d !== value)} onPick={onPick} onMonth={onMonth} />
  );
}

function DateChip({ children, accent = false }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: "var(--radius-full)", background: "var(--surface-subtle)", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", color: accent ? "var(--accent-strong)" : "var(--text-secondary)" }}>
      <i data-lucide="calendar" style={{ width: 14, height: 14 }}></i>{children}
    </span>
  );
}

// Big picker name + serif line — the system's one hero pattern
function PickerHero({ name, line = "picks the film.", meta, size = 84, align = "left" }) {
  const first = name.split(" ")[0];
  return (
    <div style={{ textAlign: align }}>
      {meta && <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)" }}>{meta}</div>}
      <div style={{ fontWeight: 800, fontSize: size, lineHeight: 0.9, letterSpacing: "-0.05em", marginTop: meta ? 12 : 0 }}>{first}</div>
      <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: Math.round(size * 0.42), lineHeight: 1.1, marginTop: 6 }}>{line}</div>
      <div style={{ width: 44, height: 4, background: "var(--accent)", marginTop: 18, marginLeft: align === "center" ? "auto" : 0, marginRight: align === "center" ? "auto" : 0 }} />
    </div>
  );
}

function Film({ children, size = 20, style }) {
  return <span style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: size, lineHeight: 1.12, color: "var(--text-primary)", ...style }}>{children}</span>;
}

function Stack({ ids, size = 30, bg = "var(--surface-page)" }) {
  return (
    <div style={{ display: "flex" }}>
      {ids.map((id, i) => <DS.Avatar key={id} name={D.byId(id).name} size={size} style={{ marginLeft: i ? -6 : 0, outline: "2px solid " + bg }} />)}
    </div>
  );
}

// ── Credit line: the picker, set small under a film ─────────────
// "Picked by Priya · May 2" (past) or "Tomas is picking" (no film yet).
function Credit({ name, pending = false, note, action, style }) {
  const first = name.split(" ")[0];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: "var(--text-secondary)", ...style }}>
      <DS.Avatar name={name} size={28} />
      <span style={{ flex: 1, minWidth: 0 }}>
        {pending ? <><b style={{ color: "var(--text-primary)", fontWeight: 600 }}>{first}</b> is picking</> : <>Picked by <b style={{ color: "var(--text-primary)", fontWeight: 600 }}>{first}</b></>}
        {note && <span style={{ color: "var(--text-tertiary)" }}> · {note}</span>}
      </span>
      {action}
    </div>
  );
}

// ── "More" button and action sheet ─────────────────────────────
// Secondary actions on a screen (Change film, Edit night, Clear film) live
// here, so the screen itself keeps one clear action, or none.
function MoreBtn() {
  return <DS.IconButton label="More" filled><i data-lucide="ellipsis" style={{ width: 20, height: 20 }}></i></DS.IconButton>;
}
function Sheet({ title, children }) {
  return (
    <>
      <div style={{ position: "absolute", inset: 0, zIndex: 26, background: "rgba(10,9,8,0.55)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 27, background: "var(--surface-raised)", borderTopLeftRadius: "var(--radius-xl)", borderTopRightRadius: "var(--radius-xl)", boxShadow: "var(--shadow-lg)", padding: "12px 20px 40px" }}>
        <div style={{ width: 38, height: 5, borderRadius: 999, background: "var(--border-strong)", margin: "0 auto 14px" }} />
        {title && <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>{title}</div>}
        {children}
      </div>
    </>
  );
}
function SheetRow({ icon, label, sub, danger, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: last ? "none" : "1px solid var(--border-hairline)", cursor: "pointer" }}>
      <i data-lucide={icon} style={{ width: 20, height: 20, flex: "none", color: danger ? "var(--text-danger)" : "var(--text-secondary)" }}></i>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: danger ? "var(--text-danger)" : "var(--text-primary)" }}>{label}</div>
        {sub && <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

Object.assign(window, { Phone, TopBar, TabBar, Screen, Footer, SectionLabel, Poster, Stat, Calendar, DateChip, PickerHero, Film, Stack, Credit, MoreBtn, Sheet, SheetRow, PHONE_W, PHONE_H, REACTIONS });
