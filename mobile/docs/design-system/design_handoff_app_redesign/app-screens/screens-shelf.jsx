// Movie Night — "the shelf": Watched + the Night screen (past, upcoming, more).

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

// ── Watched (tab) ──────────────────────────────────────────────
function HistoryScreen() {
  const groups = groupByMonth(_SD.nights);
  const films = new Set(_SD.nights.map((n) => n.movie)).size;
  return (
    <window.Phone>
      <window.TopBar kind="tab" title="Watched" group={`${_SD.nights.length} nights since ${_SD.fmtDate(_SD.group.since, true).replace(/,.*/, "")} 2025.`} />
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
      <window.TabBar active="watched" />
    </window.Phone>
  );
}

// ── Night (one screen for every night: past, tonight, or ahead) ──
// The film leads; the picker is a credit line under it. A night has at most
// one primary action (none once it's recorded). Change film, Edit night and
// Clear film sit behind the "More" button.
function NightHead({ movie, meta, pending, pickerName, note }) {
  const mv = movie && _SD.movies[movie];
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 18, alignItems: "flex-end" }}>
        {mv
          ? <window.Poster id={movie} w={120} h={180} radius="var(--radius-md)" showTitle={false} style={{ boxShadow: "var(--shadow-md)" }} />
          : <div style={{ width: 120, height: 180, flex: "none", borderRadius: "var(--radius-md)", boxShadow: "inset 0 0 0 1.5px var(--border-strong)", display: "grid", placeItems: "center", color: "var(--text-tertiary)" }}><i data-lucide="clapperboard" style={{ width: 28, height: 28 }}></i></div>}
        <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>{meta}</div>
          {mv
            ? <window.Film size={32} style={{ display: "block", marginTop: 8 }}>{mv.title}</window.Film>
            : <window.Film size={32} style={{ display: "block", marginTop: 8, color: "var(--text-tertiary)" }}>Not picked yet.</window.Film>}
          {mv && <div style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 8, fontVariantNumeric: "tabular-nums" }}>{mv.year} · {mv.runtime}</div>}
        </div>
      </div>
      <window.Credit name={pickerName} pending={pending} note={note} style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--border-hairline)" }} />
    </div>
  );
}
function PeopleList({ label, ids, pickerId }) {
  return (
    <>
      <window.SectionLabel style={{ marginTop: 28 }}>{label} · {ids.length}</window.SectionLabel>
      {ids.map((id, i) => (
        <div key={id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < ids.length - 1 ? "1px solid var(--border-hairline)" : "none" }}>
          <SAvatar name={_SD.byId(id).name} size="sm" />
          <span style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>{_SD.byId(id).name}</span>
          {id === pickerId && <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Picker</span>}
        </div>
      ))}
    </>
  );
}

// Past night (from Watched): nothing to do but look; actions behind More.
function NightDetailScreen({ sheet = false }) {
  const n = _SD.nights.find((x) => x.id === "n-02");
  const picker = _SD.byId(n.pickerId);
  const r = window.REACTIONS[n.reaction];
  return (
    <window.Phone>
      <window.TopBar title="" back="Watched" right={<window.MoreBtn />} />
      <window.Screen tabbar={false}>
        <NightHead movie={n.movie} meta={_SD.fmtWeekdayDate(n.date)} pickerName={picker.name} />
        <div style={{ marginTop: 14 }}><SBadge tone="neutral">{r.glyph} {r.label}</SBadge></div>
        <PeopleList label="Who watched" ids={n.presentIds} pickerId={n.pickerId} />
      </window.Screen>
      {sheet && (
        <window.Sheet title={_SD.movies[n.movie].title + " · " + _SD.fmtDate(n.date)}>
          <window.SheetRow icon="film" label="Change film" sub={"Keeps the night and " + picker.name.split(" ")[0] + "'s pick"} />
          <window.SheetRow icon="pencil" label="Edit night" sub="Date, time and who watched" />
          <window.SheetRow icon="x" label="Clear film" sub="The night stays; the film is removed" danger last />
        </window.Sheet>
      )}
    </window.Phone>
  );
}
function NightMoreScreen() { return <NightDetailScreen sheet />; }

// A night that hasn't happened yet (from Tonight, Upcoming or a reminder).
// One action: choose the film. Edit night and Add to calendar sit behind More.
function NightUpcomingScreen() {
  const s = _SD.scheduledNight;
  const picker = _SD.byId(s.pickerId);
  const first = picker.name.split(" ")[0];
  return (
    <window.Phone>
      <window.TopBar title="" back="Tonight" right={<window.MoreBtn />} />
      <window.Screen tabbar={false}>
        <NightHead meta={`${_SD.relativeLabel(s.date)} · ${_SD.fmtDate(s.date)} · 8 pm`} pending pickerName={picker.name} />
        <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5, marginTop: 14 }}>{first} can choose now or on the night. Whatever it is, you watch it.</div>
        <PeopleList label="Coming" ids={s.presentIds} pickerId={s.pickerId} />
      </window.Screen>
      <window.Footer>
        <SButton fullWidth>Choose the film</SButton>
      </window.Footer>
    </window.Phone>
  );
}

Object.assign(window, { HistoryScreen, NightDetailScreen, NightMoreScreen, NightUpcomingScreen });
