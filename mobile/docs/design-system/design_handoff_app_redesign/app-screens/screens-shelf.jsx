// Movie Night — "the shelf": History + Night detail.

const _shelf_DS = window.MovieNightDesignSystem_b54ad3;
const { Avatar: SAvatar, Badge: SBadge } = _shelf_DS;
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

function sigIndex(name) { let h = 0; for (const c of name.trim()) h = (h + c.charCodeAt(0)) % 7; return h; }
function sigDot(name) { return <span style={{ width: 8, height: 8, borderRadius: "50%", flex: "none", background: "var(--sig-" + (sigIndex(name) + 1) + ")" }}></span>; }
window.sigDot = sigDot;

function NightRow({ n, last }) {
  const mv = _SD.movies[n.movie];
  const picker = _SD.byId(n.pickerId);
  const r = window.REACTIONS[n.reaction];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 0", borderBottom: last ? "none" : "1px solid var(--border-hairline)", cursor: "pointer" }}>
      <window.Poster id={n.movie} w={46} h={69} showTitle={false} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><window.Film size={20}>{mv.title}</window.Film></div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5, fontSize: 13, color: "var(--text-secondary)" }}>
          {sigDot(picker.name)}<span>{picker.name.split(" ")[0]}'s pick</span>
          {n.reaction === "loved" && <span style={{ color: "var(--text-tertiary)" }}>· {r.glyph}</span>}
        </div>
      </div>
      <span style={{ fontSize: 13, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{_SD.fmtDate(n.date)}</span>
    </div>
  );
}

// ── History (tab) ──────────────────────────────────────────────
function HistoryScreen() {
  const groups = groupByMonth(_SD.nights);
  const films = new Set(_SD.nights.map((n) => n.movie)).size;
  return (
    <window.Phone>
      <window.TopBar kind="tab" title="History" group={`${_SD.nights.length} nights since ${_SD.fmtDate(_SD.group.since, true).replace(/,.*/, "")} 2025.`} />
      <window.Screen>
        <div style={{ display: "flex", gap: 30, marginTop: 20 }}>
          <window.Stat value={_SD.nights.length} label="Nights" />
          <window.Stat value={films} label="Films" />
          <window.Stat value={_SD.nights.filter((n) => n.reaction === "loved").length} label="Loved" />
        </div>
        {groups.map((g) => (
          <div key={g.label}>
            <window.SectionLabel style={{ marginTop: 28 }}>{g.label}</window.SectionLabel>
            {g.items.map((n, i) => <NightRow key={n.id} n={n} last={i === g.items.length - 1} />)}
          </div>
        ))}
      </window.Screen>
      <window.TabBar active="history" />
    </window.Phone>
  );
}

// ── Night detail ───────────────────────────────────────────────
function NightDetailScreen() {
  const n = _SD.nights.find((x) => x.id === "n-02");
  const mv = _SD.movies[n.movie];
  const picker = _SD.byId(n.pickerId);
  const r = window.REACTIONS[n.reaction];
  return (
    <window.Phone>
      <window.TopBar title="" back="History" right={<i data-lucide="ellipsis" style={{ width: 20, height: 20, color: "var(--text-secondary)" }}></i>} />
      <window.Screen tabbar={false}>
        <div style={{ display: "flex", gap: 18, marginTop: 10, alignItems: "flex-end" }}>
          <window.Poster id={n.movie} w={120} h={180} radius="var(--radius-md)" showTitle={false} style={{ boxShadow: "var(--shadow-md)" }} />
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
            <window.Film size={32} style={{ display: "block" }}>{mv.title}</window.Film>
            <div style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 8 }}>{mv.year} · {mv.runtime}</div>
            <div style={{ marginTop: 14 }}><SBadge tone="neutral">{r.glyph} {r.label}</SBadge></div>
          </div>
        </div>
        <div style={{ marginTop: 34 }}>
          <window.PickerHero name={picker.name} line="picked it." size={56} meta={_SD.fmtDate(n.date, true)} />
        </div>
        <window.SectionLabel style={{ marginTop: 30 }}>Who watched · {n.presentIds.length}</window.SectionLabel>
        {n.presentIds.map((id, i) => (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < n.presentIds.length - 1 ? "1px solid var(--border-hairline)" : "none" }}>
            <SAvatar name={_SD.byId(id).name} size="sm" />
            <span style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>{_SD.byId(id).name}</span>
            {id === n.pickerId && <SBadge tone="neutral">Picker</SBadge>}
          </div>
        ))}
      </window.Screen>
    </window.Phone>
  );
}

Object.assign(window, { HistoryScreen, NightDetailScreen });
