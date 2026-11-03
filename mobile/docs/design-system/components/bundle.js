/* @ds-bundle: {"format":4,"namespace":"MovieNightDesignSystem_b54ad3","components":[{"name":"Button"},{"name":"IconButton"},{"name":"Logomark"},{"name":"Avatar"},{"name":"MemberRow"},{"name":"Poster"},{"name":"SectionLabel"},{"name":"SettingsRow"},{"name":"Stat"},{"name":"Badge"},{"name":"Banner"},{"name":"Stepper"},{"name":"Toast"},{"name":"Calendar"},{"name":"Input"},{"name":"Toggle"},{"name":"TopBar"},{"name":"TabBar"},{"name":"UpNextCard"}]} */
var __mn = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // entry.js
  var entry_exports = {};
  __export(entry_exports, {
    Avatar: () => Avatar,
    Badge: () => Badge,
    Banner: () => Banner,
    Button: () => Button,
    Calendar: () => Calendar,
    IconButton: () => IconButton,
    Input: () => Input,
    Logomark: () => Logomark,
    MemberRow: () => MemberRow,
    Poster: () => Poster,
    SectionLabel: () => SectionLabel,
    SettingsRow: () => SettingsRow,
    Stat: () => Stat,
    Stepper: () => Stepper,
    Toast: () => Toast,
    Toggle: () => Toggle,
    TabBar: () => TabBar,
    TopBar: () => TopBar,
    UpNextCard: () => UpNextCard,
    signatureColor: () => signatureColor,
    signatureIndex: () => signatureIndex
  });

  // react-shim.js
  var react_shim_default = window.React;

  // ../ds/project/components/src/core/Button.jsx
  function Button({ children, variant = "primary", size = "md", disabled = false, fullWidth = false, type = "button", onClick, style, ...rest }) {
    const pad2 = size === "sm" ? "8px 16px" : size === "lg" ? "17px 28px" : "13px 22px";
    const fontSize = size === "sm" ? "var(--text-sm)" : "var(--text-base)";
    const variants = {
      primary: { background: "var(--accent)", color: "var(--text-on-accent)", border: "1px solid transparent" },
      secondary: { background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border-strong)" },
      ghost: { background: "transparent", color: "var(--text-secondary)", border: "1px solid transparent" },
      danger: { background: "transparent", color: "var(--text-danger)", border: "1px solid transparent" }
    };
    const ghostLike = variant === "ghost" || variant === "danger";
    const off = disabled ? ghostLike ? { opacity: 0.45 } : { background: "var(--surface-subtle)", color: "var(--text-tertiary)", border: "1px solid transparent" } : null;
    return /* @__PURE__ */ react_shim_default.createElement(
      "button",
      {
        type,
        disabled,
        onClick,
        style: {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-2)",
          width: fullWidth ? "100%" : "auto",
          padding: ghostLike ? size === "sm" ? "8px 4px" : "13px 6px" : pad2,
          fontFamily: "var(--font-sans)",
          fontSize,
          fontWeight: "var(--weight-bold)",
          lineHeight: 1,
          whiteSpace: "nowrap",
          flex: "none",
          borderRadius: "var(--radius-full)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: 1,
          transition: "opacity var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)",
          WebkitTapHighlightColor: "transparent",
          ...variants[variant],
          ...off,
          ...style
        },
        onMouseDown: (e) => {
          if (!disabled) e.currentTarget.style.opacity = "var(--pressed-opacity)";
        },
        onMouseUp: (e) => {
          if (!disabled) e.currentTarget.style.opacity = "1";
        },
        onMouseEnter: (e) => {
          if (disabled) return;
          if (variant === "primary") e.currentTarget.style.background = "var(--accent-hover)";
          if (variant === "ghost") e.currentTarget.style.color = "var(--text-primary)";
          if (variant === "secondary") e.currentTarget.style.background = "var(--surface-subtle)";
        },
        onMouseLeave: (e) => {
          if (disabled) return;
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.background = variants[variant].background;
          e.currentTarget.style.color = variants[variant].color;
        },
        ...rest
      },
      children
    );
  }

  // ../ds/project/components/src/core/IconButton.jsx
  function IconButton({ children, size = "md", label, filled = false, disabled = false, onClick, style, ...rest }) {
    const dim = size === "sm" ? 32 : 40;
    const bg = filled ? "var(--surface-subtle)" : "transparent";
    return /* @__PURE__ */ react_shim_default.createElement(
      "button",
      {
        type: "button",
        "aria-label": label,
        title: label,
        disabled,
        onClick,
        style: {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: dim,
          height: dim,
          padding: 0,
          color: "var(--text-secondary)",
          background: bg,
          border: "none",
          borderRadius: "var(--radius-full)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
          transition: "background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)",
          WebkitTapHighlightColor: "transparent",
          ...style
        },
        onMouseEnter: (e) => {
          if (!disabled) {
            e.currentTarget.style.background = "var(--surface-raised)";
            e.currentTarget.style.color = "var(--text-primary)";
          }
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.background = bg;
          e.currentTarget.style.color = "var(--text-secondary)";
          e.currentTarget.style.opacity = "1";
        },
        onMouseDown: (e) => {
          if (!disabled) e.currentTarget.style.opacity = "var(--pressed-opacity)";
        },
        onMouseUp: (e) => {
          if (!disabled) e.currentTarget.style.opacity = "1";
        },
        ...rest
      },
      children
    );
  }

  // ../ds/project/components/src/core/Logomark.jsx
  function Logomark({ size = 32, tile = false, style }) {
    const mark = /* @__PURE__ */ react_shim_default.createElement("svg", { width: size, height: size, viewBox: "0 0 32 32", "aria-hidden": "true", style: { display: "block" } }, /* @__PURE__ */ react_shim_default.createElement("rect", { x: "4.5", y: "5.5", width: "23", height: "21", rx: "4.5", fill: "none", stroke: "currentColor", strokeWidth: "2.4" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "M11 2.5v5.5M21 2.5v5.5", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "M12.2 10.7v9.6a.8.8 0 0 0 1.2.7l7.6-4.8a.8.8 0 0 0 0-1.4l-7.6-4.8a.8.8 0 0 0-1.2.7Z", fill: "var(--accent)" }));
    if (!tile) return /* @__PURE__ */ react_shim_default.createElement("span", { role: "img", "aria-label": "Movie Night", style: { display: "inline-flex", color: "var(--text-primary)", ...style } }, mark);
    const t = size * 1.9;
    return /* @__PURE__ */ react_shim_default.createElement("span", { role: "img", "aria-label": "Movie Night", style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: t, height: t, borderRadius: t * 0.225, background: "var(--ink-950)", color: "var(--ink-100)", ...style } }, mark);
  }

  // ../ds/project/components/src/data/Avatar.jsx
  var SIZES = { sm: 28, md: 40, lg: 56 };
  function signatureIndex(name = "") {
    const key = name.trim();
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h + key.charCodeAt(i)) % 7;
    return h;
  }
  function signatureColor(name) {
    return "var(--sig-" + (signatureIndex(name) + 1) + ")";
  }
  function initials(name = "") {
    const w = name.trim().split(/\s+/).filter(Boolean);
    return w.length ? w.slice(0, 2).map((x) => x[0]).join("").toUpperCase() : "?";
  }
  function Avatar({ name = "", size = "md", style }) {
    const px = typeof size === "number" ? size : SIZES[size] || 40;
    return /* @__PURE__ */ react_shim_default.createElement(
      "div",
      {
        "aria-hidden": "true",
        style: {
          width: px,
          height: px,
          flex: "none",
          borderRadius: "var(--radius-full)",
          background: signatureColor(name),
          color: "var(--text-on-sig)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-sans)",
          fontWeight: "var(--weight-bold)",
          fontSize: Math.round(px * 0.36),
          lineHeight: 1,
          letterSpacing: "-0.01em",
          ...style
        }
      },
      initials(name)
    );
  }

  // ../ds/project/components/src/data/MemberRow.jsx
  function MemberRow({ name, meta, trailing, leading, showAvatar = true, compact = false, highlighted = false, muted = false, divider = true, onClick, style, ...rest }) {
    const interactive = typeof onClick === "function";
    let lead = null;
    if (leading != null) lead = leading;
    else if (compact) lead = /* @__PURE__ */ react_shim_default.createElement("span", { "aria-hidden": "true", style: { width: 10, height: 10, borderRadius: "50%", background: signatureColor(name), flex: "none" } });
    else if (showAvatar) lead = /* @__PURE__ */ react_shim_default.createElement(Avatar, { name });
    return /* @__PURE__ */ react_shim_default.createElement(
      "div",
      {
        onClick,
        role: interactive ? "button" : void 0,
        tabIndex: interactive ? 0 : void 0,
        style: {
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          padding: compact ? "12px 0" : "12px 0",
          borderBottom: divider ? "1px solid var(--border-hairline)" : "1px solid transparent",
          cursor: interactive ? "pointer" : "default",
          opacity: muted ? 0.55 : 1,
          transition: "opacity var(--duration-fast) var(--ease-standard)",
          WebkitTapHighlightColor: "transparent",
          ...style
        },
        onMouseDown: (e) => {
          if (interactive) e.currentTarget.style.opacity = "var(--pressed-opacity)";
        },
        onMouseUp: (e) => {
          if (interactive) e.currentTarget.style.opacity = muted ? "0.55" : "1";
        },
        onMouseLeave: (e) => {
          if (interactive) e.currentTarget.style.opacity = muted ? "0.55" : "1";
        },
        ...rest
      },
      lead,
      /* @__PURE__ */ react_shim_default.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-sans)", fontSize: highlighted ? 20 : "var(--text-lg)", fontWeight: highlighted ? "var(--weight-heavy)" : "var(--weight-semibold)", letterSpacing: highlighted ? "var(--tracking-title)" : 0, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.25 } }, name), meta != null && /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: 2, fontVariantNumeric: "tabular-nums" } }, meta)),
      trailing != null && /* @__PURE__ */ react_shim_default.createElement("div", { style: { flex: "none", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" } }, trailing)
    );
  }

  // ../ds/project/components/src/data/Poster.jsx
  function Poster({ uri, title = "\u2014", year, hue = 30, w = 56, h = 84, style }) {
    const [failed, setFailed] = react_shim_default.useState(false);
    const showImage = !!uri && !failed;
    return /* @__PURE__ */ react_shim_default.createElement("div", { style: { position: "relative", width: w, height: h, flex: "none", borderRadius: "var(--radius-sm)", overflow: "hidden", background: "linear-gradient(160deg, hsl(" + hue + " 30% 26%), hsl(" + hue + " 34% 12%))", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)", ...style } }, showImage ? /* @__PURE__ */ react_shim_default.createElement("img", { src: uri, alt: title, onError: () => setFailed(true), style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } }) : h >= 104 ? /* @__PURE__ */ react_shim_default.createElement("div", { style: { position: "absolute", left: 10, right: 10, bottom: 10 } }, /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 16, lineHeight: 1.1, color: "#EDE8E0" } }, title), year ? /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-sans)", fontSize: 11, color: "rgba(237,232,224,0.6)", marginTop: 4, fontVariantNumeric: "tabular-nums" } }, year) : null) : null);
  }

  // ../ds/project/components/src/data/SectionLabel.jsx
  function SectionLabel({ children, style }) {
    return /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: "var(--weight-semibold)", color: "var(--text-secondary)", margin: "var(--space-6) 0 var(--space-2)", ...style } }, children);
  }

  // ../ds/project/components/src/data/SettingsRow.jsx
  function SettingsRow({ label, value, right, onClick, disabled = false, danger = false, divider = false, style }) {
    const interactive = typeof onClick === "function" && !disabled;
    return /* @__PURE__ */ react_shim_default.createElement(
      "div",
      {
        onClick: interactive ? onClick : void 0,
        role: interactive ? "button" : void 0,
        tabIndex: interactive ? 0 : void 0,
        style: { display: "flex", alignItems: "center", gap: "var(--space-3)", minHeight: 52, padding: "0 var(--space-4)", borderBottom: divider ? "1px solid var(--border-hairline)" : "none", opacity: disabled ? 0.45 : 1, cursor: interactive ? "pointer" : "default", ...style },
        onMouseDown: (e) => {
          if (interactive) e.currentTarget.style.opacity = "var(--pressed-opacity)";
        },
        onMouseUp: (e) => {
          if (interactive) e.currentTarget.style.opacity = "1";
        },
        onMouseLeave: (e) => {
          if (interactive) e.currentTarget.style.opacity = "1";
        }
      },
      /* @__PURE__ */ react_shim_default.createElement("span", { style: { flex: 1, minWidth: 0, fontFamily: "var(--font-sans)", fontSize: "var(--text-base)", fontWeight: "var(--weight-medium)", color: danger ? "var(--text-danger)" : "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, label),
      value ? /* @__PURE__ */ react_shim_default.createElement("span", { style: { fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } }, value) : null,
      right ? /* @__PURE__ */ react_shim_default.createElement("span", { style: { display: "inline-flex", color: "var(--text-tertiary)" } }, right) : null
    );
  }

  // ../ds/project/components/src/data/Stat.jsx
  function Stat({ value, label, accent = false, style }) {
    return /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 2, ...style } }, /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-display)", fontWeight: "var(--weight-heavy)", fontSize: 30, lineHeight: 1, letterSpacing: "var(--tracking-title)", fontVariantNumeric: "tabular-nums", color: accent ? "var(--accent-strong)" : "var(--text-primary)" } }, value), /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" } }, label));
  }

  // ../ds/project/components/src/feedback/Badge.jsx
  function Badge({ children, tone = "accent", solid = false, style }) {
    const tones = {
      accent: { bg: "var(--surface-spotlight)", fg: "var(--accent-strong)" },
      neutral: { bg: "var(--surface-subtle)", fg: "var(--text-secondary)" },
      muted: { bg: "transparent", fg: "var(--text-tertiary)", border: "1px solid var(--border-hairline)" },
      danger: { bg: "var(--surface-danger)", fg: "var(--text-danger)" },
      success: { bg: "var(--surface-success)", fg: "var(--success)" }
    };
    const t = solid ? { bg: "var(--accent)", fg: "var(--text-on-accent)" } : tones[tone] || tones.accent;
    return /* @__PURE__ */ react_shim_default.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: "var(--radius-full)", background: t.bg, color: t.fg, border: t.border || "1px solid transparent", fontFamily: "var(--font-sans)", fontSize: "var(--text-caption)", fontWeight: "var(--weight-bold)", lineHeight: 1.2, letterSpacing: "var(--tracking-caption)", whiteSpace: "nowrap", ...style } }, children);
  }

  // ../ds/project/components/src/feedback/Banner.jsx
  function Banner({ children, tone = "info", style, ...rest }) {
    const tones = {
      danger: { color: "var(--text-danger)", bg: "var(--surface-danger)" },
      info: { color: "var(--text-secondary)", bg: "var(--surface-subtle)" },
      success: { color: "var(--success)", bg: "var(--surface-success)" }
    };
    const t = tones[tone] || tones.info;
    return /* @__PURE__ */ react_shim_default.createElement("div", { role: tone === "danger" ? "alert" : "status", style: { fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", lineHeight: "var(--leading-normal)", color: t.color, background: t.bg, borderRadius: "var(--radius-md)", padding: "var(--space-3) var(--space-4)", textWrap: "pretty", ...style }, ...rest }, children);
  }

  // ../ds/project/components/src/feedback/Stepper.jsx
  function Stepper({ current = 0, steps = ["Date", "People", "Movie", "Done"], style }) {
    return /* @__PURE__ */ react_shim_default.createElement("div", { role: "progressbar", "aria-valuemin": 1, "aria-valuemax": steps.length, "aria-valuenow": current + 1, style: { display: "grid", gridTemplateColumns: "repeat(" + steps.length + ", minmax(0,1fr))", gap: 6, ...style } }, steps.map((label, i) => {
      const on = i === current, done = i < current;
      return /* @__PURE__ */ react_shim_default.createElement("div", { key: label, style: { display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ react_shim_default.createElement("div", { style: { height: 3, borderRadius: 2, background: on ? "var(--accent)" : done ? "var(--text-primary)" : "var(--border-strong)" } }), /* @__PURE__ */ react_shim_default.createElement("span", { style: { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: on ? "var(--weight-bold)" : "var(--weight-medium)", color: on || done ? "var(--text-primary)" : "var(--text-tertiary)" } }, label));
    }));
  }

  // ../ds/project/components/src/feedback/Toast.jsx
  function Toast({ title, body, style }) {
    return /* @__PURE__ */ react_shim_default.createElement("div", { role: "status", style: { display: "flex", alignItems: "flex-start", gap: "var(--space-3)", padding: "14px 16px", borderRadius: "var(--radius-md)", background: "var(--surface-raised)", boxShadow: "var(--shadow-md), inset 0 0 0 1px var(--border-hairline)", ...style } }, /* @__PURE__ */ react_shim_default.createElement("span", { "aria-hidden": "true", style: { flex: "none", width: 22, height: 22, borderRadius: "50%", background: "var(--text-primary)", color: "var(--surface-page)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 } }, /* @__PURE__ */ react_shim_default.createElement("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3.2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ react_shim_default.createElement("path", { d: "M20 6 9 17l-5-5" }))), /* @__PURE__ */ react_shim_default.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-sans)", fontSize: "var(--text-base)", fontWeight: "var(--weight-bold)", color: "var(--text-primary)", lineHeight: 1.3 } }, title), body ? /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.4 } }, body) : null));
  }

  // ../ds/project/components/src/forms/Calendar.jsx
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var WD = ["S", "M", "T", "W", "T", "F", "S"];
  var pad = (n) => n < 10 ? "0" + n : "" + n;
  var chev = (d) => /* @__PURE__ */ react_shim_default.createElement("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ react_shim_default.createElement("path", { d }));
  function Calendar({ value, today, month, nightDates = [], onPick, onMonth, style }) {
    const nights = new Set(nightDates);
    const first = new Date(month.year, month.month - 1, 1).getDay();
    const days = new Date(month.year, month.month, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push({ d, iso: month.year + "-" + pad(month.month) + "-" + pad(d) });
    const navBtn = (dir, label, path) => /* @__PURE__ */ react_shim_default.createElement("button", { type: "button", "aria-label": label, onClick: () => onMonth && onMonth(dir), style: { width: 36, height: 36, border: "none", borderRadius: "50%", background: "var(--surface-subtle)", color: "var(--text-primary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" } }, chev(path));
    return /* @__PURE__ */ react_shim_default.createElement("div", { style: { ...style } }, /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" } }, /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-display)", fontWeight: "var(--weight-heavy)", fontSize: "var(--text-xl)", letterSpacing: "var(--tracking-title)", color: "var(--text-primary)" } }, MONTHS[month.month - 1], " ", /* @__PURE__ */ react_shim_default.createElement("span", { style: { color: "var(--text-tertiary)", fontWeight: "var(--weight-semibold)" } }, month.year)), /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "flex", gap: 8 } }, navBtn(-1, "Previous month", "m15 18-6-6 6-6"), navBtn(1, "Next month", "m9 18 6-6-6-6"))), /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", rowGap: 2 } }, WD.map((w, i) => /* @__PURE__ */ react_shim_default.createElement("div", { key: i, style: { textAlign: "center", fontFamily: "var(--font-sans)", fontSize: "var(--text-caption)", fontWeight: "var(--weight-semibold)", color: "var(--text-tertiary)", paddingBottom: 6 } }, w)), cells.map((c, i) => {
      if (!c) return /* @__PURE__ */ react_shim_default.createElement("div", { key: "b" + i });
      const sel = c.iso === value, isToday = c.iso === today, past = today && c.iso < today, night = nights.has(c.iso);
      return /* @__PURE__ */ react_shim_default.createElement("button", { key: c.iso, type: "button", "aria-label": c.iso, "aria-pressed": sel, onClick: () => onPick && onPick(c.iso), style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "3px 0", background: "none", border: "none", cursor: "pointer" } }, /* @__PURE__ */ react_shim_default.createElement("span", { style: { width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", fontSize: "var(--text-base)", fontVariantNumeric: "tabular-nums", fontWeight: sel || isToday ? "var(--weight-bold)" : "var(--weight-regular)", background: sel ? "var(--accent)" : "transparent", color: sel ? "var(--text-on-accent)" : past ? "var(--text-tertiary)" : "var(--text-primary)", boxShadow: isToday && !sel ? "inset 0 0 0 1.5px var(--text-primary)" : "none" } }, c.d), /* @__PURE__ */ react_shim_default.createElement("span", { style: { width: 4, height: 4, borderRadius: "50%", background: night ? "var(--text-primary)" : "transparent" } }));
    })));
  }

  // ../ds/project/components/src/forms/Input.jsx
  function Input({ value, onChange, placeholder, invalid = false, disabled = false, addon, type = "text", style, ...rest }) {
    const [focused, setFocused] = react_shim_default.useState(false);
    const ring = invalid ? "inset 0 0 0 1.5px var(--danger)" : focused ? "inset 0 0 0 1.5px var(--border-focus), var(--shadow-focus)" : "inset 0 0 0 1px var(--border-hairline)";
    return /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "flex", alignItems: "stretch", gap: "var(--space-2)", width: "100%" } }, /* @__PURE__ */ react_shim_default.createElement(
      "input",
      {
        type,
        value,
        onChange,
        placeholder,
        disabled,
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
        style: { flex: 1, minWidth: 0, height: 48, fontFamily: "var(--font-sans)", fontSize: "var(--text-base)", color: "var(--text-primary)", background: disabled ? "var(--surface-subtle)" : "var(--surface-card)", padding: "0 var(--space-4)", border: "none", borderRadius: "var(--radius-md)", outline: "none", boxShadow: ring, transition: "box-shadow var(--duration-fast) var(--ease-standard)", ...style },
        ...rest
      }
    ), addon);
  }

  // ../ds/project/components/src/forms/Toggle.jsx
  function Toggle({ value = false, onChange, label, disabled = false, style }) {
    return /* @__PURE__ */ react_shim_default.createElement(
      "button",
      {
        type: "button",
        role: "switch",
        "aria-checked": value,
        "aria-label": label,
        disabled,
        onClick: () => onChange && onChange(!value),
        style: { position: "relative", width: 44, height: 26, flex: "none", padding: 0, border: "none", borderRadius: "var(--radius-full)", background: value ? "var(--accent)" : "var(--control-track-off)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, transition: "background var(--duration-base) var(--ease-standard)", ...style }
      },
      /* @__PURE__ */ react_shim_default.createElement("span", { style: { position: "absolute", top: 3, left: 3, width: 20, height: 20, borderRadius: "50%", background: "var(--control-knob)", boxShadow: "var(--shadow-sm)", transform: value ? "translateX(18px)" : "none", transition: "transform var(--duration-base) var(--ease-out)" } })
    );
  }

  // ../ds/project/components/src/navigation/TopBar.jsx
  function TopBar({ kind = "tab", title, sub, group, back, right, style }) {
    const wrap = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", padding: "var(--space-2) var(--space-5)", minHeight: 52, ...style };
    if (kind === "home") {
      return /* @__PURE__ */ react_shim_default.createElement("div", { style: wrap }, /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } }, /* @__PURE__ */ react_shim_default.createElement(Logomark, { size: 22 }), /* @__PURE__ */ react_shim_default.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-display)", fontWeight: "var(--weight-heavy)", fontSize: 17, letterSpacing: "-0.02em", color: "var(--text-primary)", lineHeight: 1.1 } }, "Movie Night"), group ? /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, group) : null)), right);
    }
    if (kind === "tab") {
      return /* @__PURE__ */ react_shim_default.createElement("div", { style: { ...wrap, alignItems: "flex-end", paddingTop: "var(--space-4)" } }, /* @__PURE__ */ react_shim_default.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-display)", fontWeight: "var(--weight-heavy)", fontSize: "var(--text-3xl)", lineHeight: 1, letterSpacing: "var(--tracking-display)", color: "var(--text-primary)" } }, title), sub ? /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-serif)", fontWeight: "var(--weight-medium)", fontSize: 19, color: "var(--text-secondary)", marginTop: 6 } }, sub) : null), right);
    }
    return /* @__PURE__ */ react_shim_default.createElement("div", { style: { ...wrap, position: "relative", justifyContent: "center" } }, back ? /* @__PURE__ */ react_shim_default.createElement("button", { type: "button", onClick: back.onClick, "aria-label": "Back to " + back.label, style: { position: "absolute", left: "var(--space-4)", display: "inline-flex", alignItems: "center", gap: 2, background: "none", border: "none", padding: 4, cursor: "pointer", color: "var(--text-primary)", fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: "var(--weight-semibold)" } }, /* @__PURE__ */ react_shim_default.createElement("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ react_shim_default.createElement("path", { d: "m15 18-6-6 6-6" })), back.label) : null, /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-display)", fontWeight: "var(--weight-bold)", fontSize: 17, letterSpacing: "-0.01em", color: "var(--text-primary)" } }, title), right ? /* @__PURE__ */ react_shim_default.createElement("div", { style: { position: "absolute", right: "var(--space-4)" } }, right) : null);
  }

  // ../ds/project/components/src/navigation/TabBar.jsx
  const Glyph = ({ children }) => /* @__PURE__ */ react_shim_default.createElement("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, children);
  const TAB_ICONS = {
    clapperboard: () => /* @__PURE__ */ react_shim_default.createElement(Glyph, null, /* @__PURE__ */ react_shim_default.createElement("path", { d: "M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "m6.2 5.3 3.1 3.9" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "m12.4 3.4 3.1 4" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" })),
    "calendar-days": () => /* @__PURE__ */ react_shim_default.createElement(Glyph, null, /* @__PURE__ */ react_shim_default.createElement("path", { d: "M8 2v4" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "M16 2v4" }), /* @__PURE__ */ react_shim_default.createElement("rect", { width: "18", height: "18", x: "3", y: "4", rx: "2" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "M3 10h18" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "M8 14h.01" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "M12 14h.01" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "M16 14h.01" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "M8 18h.01" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "M12 18h.01" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "M16 18h.01" })),
    library: () => /* @__PURE__ */ react_shim_default.createElement(Glyph, null, /* @__PURE__ */ react_shim_default.createElement("path", { d: "m16 6 4 14" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "M12 6v14" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "M8 8v12" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "M4 4v16" })),
    "users-round": () => /* @__PURE__ */ react_shim_default.createElement(Glyph, null, /* @__PURE__ */ react_shim_default.createElement("path", { d: "M18 21a8 8 0 0 0-16 0" }), /* @__PURE__ */ react_shim_default.createElement("circle", { cx: "10", cy: "8", r: "5" }), /* @__PURE__ */ react_shim_default.createElement("path", { d: "M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" }))
  };
  const DEFAULT_TABS = [
    { id: "tonight", label: "Tonight", icon: "clapperboard" },
    { id: "watched", label: "Watched", icon: "library" },
    { id: "club", label: "Club", icon: "users-round" }
  ];
  function TabBar({ active = "tonight", onChange, tabs = DEFAULT_TABS, style }) {
    return /* @__PURE__ */ react_shim_default.createElement("nav", { "aria-label": "Main", style: { display: "flex", justifyContent: "space-around", padding: "var(--space-2) var(--space-2) var(--space-6)", background: "var(--surface-tab-bar)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderTop: "1px solid var(--border-hairline)", ...style } }, tabs.map((t) => {
      const on = t.id === active;
      const icon = typeof t.icon === "string" ? TAB_ICONS[t.icon] ? TAB_ICONS[t.icon]() : null : t.icon;
      return /* @__PURE__ */ react_shim_default.createElement(
        "button",
        {
          key: t.id,
          type: "button",
          "aria-current": on ? "page" : void 0,
          onClick: onChange ? () => onChange(t.id) : void 0,
          style: { flex: "1 1 0", minWidth: 0, minHeight: 48, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--space-1)", background: "none", border: "none", padding: "var(--space-1) 0", cursor: "pointer", color: on ? "var(--text-primary)" : "var(--text-secondary)", transition: "color var(--duration-fast) var(--ease-out)" }
        },
        icon,
        /* @__PURE__ */ react_shim_default.createElement("span", { style: { fontFamily: "var(--font-sans)", fontSize: "var(--text-caption)", lineHeight: 1.2, fontWeight: on ? "var(--weight-semibold)" : "var(--weight-medium)" } }, t.label)
      );
    }));
  }
  // ../ds/project/components/src/night/UpNextCard.jsx
  function UpNextCard({ date, countdown, time, picker, film, posterUri, hue = 30, year, genre, runtime, coming = [], due = false, onChooseFilm, onWatched, onOpen, onEdit, style }) {
    const first = (picker || "").trim().split(/\s+/)[0];
    const genres = Array.isArray(genre) ? genre.filter(Boolean).join(", ") : genre;
    const main = !film ? { label: "Choose the film", onClick: onChooseFilm } : due ? { label: "We watched it", onClick: onWatched } : null;
    return /* @__PURE__ */ react_shim_default.createElement("div", { onClick: onOpen, style: { background: "var(--surface-card)", borderRadius: "var(--radius-xl)", padding: "var(--space-6) var(--space-5) var(--space-5)", cursor: onOpen ? "pointer" : void 0, ...style } }, /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--text-secondary)" } }, /* @__PURE__ */ react_shim_default.createElement("span", { style: { width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" } }), /* @__PURE__ */ react_shim_default.createElement("span", null, [countdown, date, time].filter(Boolean).join(" \xB7 "))), /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "flex", gap: "var(--space-4)", alignItems: "flex-end", marginTop: "var(--space-4)" } }, film ? /* @__PURE__ */ react_shim_default.createElement(Poster, { uri: posterUri, title: film, year, hue, w: 88, h: 132, style: { boxShadow: "var(--shadow-sm)" } }) : /* @__PURE__ */ react_shim_default.createElement("div", { style: { width: 88, height: 132, flex: "none", borderRadius: "var(--radius-sm)", boxShadow: "inset 0 0 0 1.5px var(--border-strong)" } }), /* @__PURE__ */ react_shim_default.createElement("div", { style: { flex: 1, minWidth: 0, paddingBottom: 2 } }, /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-serif)", fontWeight: "var(--weight-medium)", fontSize: "var(--text-2xl)", lineHeight: 1.08, letterSpacing: "-0.015em", color: film ? "var(--text-primary)" : "var(--text-tertiary)", overflowWrap: "break-word", hyphens: "auto" } }, film ? film : "Not picked yet."), film && (year || genres || runtime) ? /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", lineHeight: 1.4, color: "var(--text-tertiary)", marginTop: "var(--space-2)", fontVariantNumeric: "tabular-nums", minWidth: 0 } }, [year, genres, runtime].filter(Boolean).map((v, k) => /* @__PURE__ */ react_shim_default.createElement("div", { key: k, style: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, String(v)))) : null)), /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-4)", fontFamily: "var(--font-sans)", fontSize: "var(--text-base)", color: "var(--text-secondary)", minWidth: 0 } }, /* @__PURE__ */ react_shim_default.createElement(Avatar, { name: picker, size: 28 }), /* @__PURE__ */ react_shim_default.createElement("span", { style: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, film ? /* @__PURE__ */ react_shim_default.createElement(react_shim_default.Fragment, null, "Picked by ", /* @__PURE__ */ react_shim_default.createElement("strong", { style: { fontWeight: "var(--weight-semibold)", color: "var(--text-primary)" } }, first)) : /* @__PURE__ */ react_shim_default.createElement(react_shim_default.Fragment, null, /* @__PURE__ */ react_shim_default.createElement("strong", { style: { fontWeight: "var(--weight-semibold)", color: "var(--text-primary)" } }, first), " is picking"))), coming.length ? /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: "var(--space-5)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--border-hairline)" } }, /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "flex" } }, coming.slice(0, 4).map((n, i) => /* @__PURE__ */ react_shim_default.createElement(Avatar, { key: n, name: n, size: 26, style: { marginLeft: i ? -8 : 0, boxShadow: "0 0 0 2px var(--surface-card)" } }))), /* @__PURE__ */ react_shim_default.createElement("span", { style: { fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" } }, coming.length, " coming")) : null, /* @__PURE__ */ react_shim_default.createElement("div", { onClick: (e) => e.stopPropagation(), style: { display: "flex", gap: "var(--space-3)", marginTop: "var(--space-5)" } }, main ? /* @__PURE__ */ react_shim_default.createElement(Button, { onClick: main.onClick, style: { flex: 1, minWidth: 0 } }, main.label) : null, /* @__PURE__ */ react_shim_default.createElement(Button, { variant: "secondary", onClick: onEdit }, "Edit")));
  }
  return __toCommonJS(entry_exports);
})();
window.MovieNightDesignSystem_b54ad3 = Object.assign(window.MovieNightDesignSystem_b54ad3 || {}, __mn);
