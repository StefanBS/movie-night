// Movie Night — "the shelf": History (what we've watched) + Night detail.
// This whole area is the product's promise — "remembers what you watched and
// who picked" — that the original three screens never surfaced.

const _shelf_DS = window.MovieNightDesignSystem_b54ad3;
const { Avatar: SAvatar, Badge: SBadge, Button: SButton } = _shelf_DS;
const _SD = window.MNData;

function groupByMonth(nights) {
  const out = [];
  let cur = null;
  for (const n of nights) {
    const label = _SD.monthLabel(n.date);
    if (!cur || cur.label !== label) { cur = { label, items: [] }; out.push(cur); }
    cur.items.push(n);
  }
  return out;
}

function NightRow({ n, last }) {
  const mv = _SD.movies[n.movie];
  const picker = _SD.byId(n.pickerId);
  const r = window.REACTIONS[n.reaction];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 4px", borderBottom: last ? "none" : "1px solid var(--border-hairline)", cursor: "pointer" }}>
      <window.Poster id={n.movie} w={48} h={71} showTitle={false} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 21, lineHeight: 1.05, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{mv.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6 }}>
          <SAvatar name={picker.name} size="sm" style={{ width: 22, height: 22, fontSize: 10 }} />
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--text-secondary)" }}>{picker.name.split(" ")[0]}'s pick</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>{_SD.fmtDate(n.date)}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: n.reaction === "loved" ? "var(--accent-strong)" : "var(--text-tertiary)" }}>{r.glyph}</span>
      </div>
    </div>
  );
}

// ── History (tab) ──────────────────────────────────────────────
function HistoryScreen() {
  const groups = groupByMonth(_SD.nights);
  return (
    <window.Phone>
      <window.TopBar kind="tab" title="History" group={`${_SD.nights.length} nights · since ${_SD.fmtDate(_SD.group.since, true).replace(/,.*/, "")} 2025`} />
      <window.Screen>
        {/* stat strip */}
        <div style={{ display: "flex", gap: 14, padding: "14px 16px", marginTop: 10, background: "var(--surface-card)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-lg)" }}>
          <div style={{ flex: 1 }}><window.Stat value={_SD.nights.length} label="Nights" /></div>
          <div style={{ width: 1, background: "var(--border-hairline)" }} />
          <div style={{ flex: 1 }}><window.Stat value={new Set(_SD.nights.map((n) => n.movie)).size} label="Films" /></div>
          <div style={{ width: 1, background: "var(--border-hairline)" }} />
          <div style={{ flex: 1 }}><window.Stat value={_SD.nights.filter((n) => n.reaction === "loved").length} label="Loved" accent /></div>
        </div>

        {groups.map((g) => (
          <div key={g.label}>
            <window.SectionLabel>{g.label}</window.SectionLabel>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {g.items.map((n, i) => <NightRow key={n.id} n={n} last={i === g.items.length - 1} />)}
            </div>
          </div>
        ))}
      </window.Screen>
      <window.TabBar active="history" />
    </window.Phone>
  );
}

// ── Night detail ───────────────────────────────────────────────
function NightDetailScreen() {
  const n = _SD.nights.find((x) => x.id === "n-02"); // Past Lives — Priya
  const mv = _SD.movies[n.movie];
  const picker = _SD.byId(n.pickerId);
  const r = window.REACTIONS[n.reaction];
  return (
    <window.Phone>
      <window.TopBar title="" back="History" right={<i data-lucide="ellipsis" style={{ width: 20, height: 20, color: "var(--text-secondary)" }}></i>} />
      <window.Screen tabbar={false}>
        {/* editorial header */}
        <div style={{ display: "flex", gap: 18, marginTop: 8 }}>
          <window.Poster id={n.movie} w={118} h={175} radius="var(--radius-lg)" showTitle={false} style={{ boxShadow: "var(--shadow-md)" }} />
          <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1.04, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)" }}>{mv.title}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>{mv.year} · {mv.runtime}</div>
            <div style={{ marginTop: 16 }}><SBadge tone={n.reaction === "loved" ? "accent" : "neutral"}>{r.glyph} {r.label}</SBadge></div>
          </div>
        </div>

        {/* the pick — spotlight */}
        <window.SectionLabel>The pick</window.SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px", background: "var(--surface-spotlight)", borderRadius: "var(--radius-md)", boxShadow: "inset 0 0 0 1px var(--accent-glow)" }}>
          <SAvatar name={picker.name} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 600, color: "var(--text-primary)" }}>{picker.name}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent-strong)", marginTop: 2, letterSpacing: "0.04em" }}>THEIR CALL · {_SD.fmtDate(n.date, true).toUpperCase()}</div>
          </div>
        </div>

        {/* who watched */}
        <window.SectionLabel>Who watched · {n.presentIds.length}</window.SectionLabel>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {n.presentIds.map((id, i) => (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: i < n.presentIds.length - 1 ? "1px solid var(--border-hairline)" : "none" }}>
              <SAvatar name={_SD.byId(id).name} size="sm" />
              <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--text-primary)" }}>{_SD.byId(id).name}</span>
              {id === n.pickerId && <SBadge>Picker</SBadge>}
            </div>
          ))}
        </div>
      </window.Screen>
    </window.Phone>
  );
}

Object.assign(window, { HistoryScreen, NightDetailScreen });
