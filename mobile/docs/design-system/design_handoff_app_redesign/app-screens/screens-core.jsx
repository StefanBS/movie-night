// Movie Night — core-loop screens: Tonight (home), planned home, full rotation.

const _core_DS = window.MovieNightDesignSystem_b54ad3;
const { Button: CButton, Badge: CBadge, MemberRow: CRow, IconButton: CIcon, Banner: CBanner, UpNextCard: CUpNext } = _core_DS;
const _D = window.MNData;

function GearBtn() {
  return <CIcon label="Settings" filled><i data-lucide="settings" style={{ width: 19, height: 19 }}></i></CIcon>;
}

function OnDeck({ order, from = 1, label }) {
  const list = order.slice(from, from + 3);
  return (
    <>
      <window.SectionLabel style={{ marginTop: 34 }}>{label || "After " + order[from - 1].name.split(" ")[0]}</window.SectionLabel>
      {list.map((m, i) => <CRow key={m.id} name={m.name} trailing={_D.picksLabel(m.servedCount)} divider={i < list.length - 1} />)}
    </>
  );
}

// ── Tonight (no night planned) ─────────────────────────────────
function HomeScreen() {
  const order = _D.turnOrder();
  const next = order[0];
  const first = next.name.split(" ")[0];
  return (
    <window.Phone>
      <window.TopBar kind="home" group={_D.group.name} right={<GearBtn />} />
      <window.Screen>
        <div style={{ marginTop: 44 }}>
          <window.PickerHero name={next.name} meta="Next up · no night planned yet" />
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.5, color: "var(--text-secondary)", marginTop: 16, maxWidth: 290 }}>
          {next.servedCount === 0 ? "Their first turn. Whatever they choose, we watch." : `${_D.picksLabel(next.servedCount)} so far, last on ${_D.fmtDate(next.lastPickedOn)}.`}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 26 }}>
          <CButton>Plan a night</CButton>
          <CButton variant="ghost">{`${first} can't make it`}</CButton>
        </div>
        <OnDeck order={order} />
        <div style={{ marginTop: 8 }}><CButton variant="ghost" size="sm" style={{ color: "var(--text-primary)" }}>See full rotation →</CButton></div>
      </window.Screen>
      <window.TabBar active="tonight" />
    </window.Phone>
  );
}

// ── Tonight (a night is on the calendar) ───────────────────────
// Tonight holds every planned night: the next one as the card, any others as
// quiet rows under "Also planned" (there is no separate calendar tab).
function AlsoPlanned({ nights }) {
  if (!nights.length) return null;
  return (
    <>
      <window.SectionLabel style={{ marginTop: 28 }}>Also planned</window.SectionLabel>
      {nights.map((n, i) => (
        <div key={n.date} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < nights.length - 1 ? "1px solid var(--border-hairline)" : "none", cursor: "pointer" }}>
          <_core_DS.Avatar name={n.picker} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{_D.weekday(n.date) + " " + +n.date.split("-")[2] + " " + _D.fmtDate(n.date).split(" ")[0] + " · " + n.time}</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 2 }}>{n.picker.split(" ")[0] + " picks"}</div>
          </div>
          <i data-lucide="chevron-right" style={{ width: 18, height: 18, color: "var(--text-tertiary)" }}></i>
        </div>
      ))}
    </>
  );
}

// The card's main button follows the night: "Choose the film" until there is
// one, then "We watched it" on the day; while the night is ahead with its film
// chosen there is no main button at all.
function PlannedHomeScreen({ tonight = false }) {
  const order = _D.turnOrder();
  const s = _D.scheduledNight;
  const picker = _D.byId(s.pickerId);
  const mv = _D.movies["past-lives"];
  const film = tonight ? { film: mv.title, hue: mv.hue, year: mv.year, genre: ["Drama", "Romance"], runtime: mv.runtime, due: true } : {};
  return (
    <window.Phone>
      <window.TopBar kind="home" group={_D.group.name} right={<GearBtn />} />
      <window.Screen>
        <CUpNext style={{ marginTop: 18 }} countdown={tonight ? "Tonight" : _D.countdownLabel(s.date)} date={tonight ? null : _D.fmtWeekdayDate(s.date)} time={tonight ? "8 pm" : s.repeat.label} picker={picker.name} coming={s.presentIds.map((id) => _D.byId(id).name)} {...film} />
        {!tonight && <AlsoPlanned nights={[{ date: "2026-06-27", time: "8 pm", picker: order.find((m) => m.id !== s.pickerId).name }]} />}
        <OnDeck order={order} label="Then" />
      </window.Screen>
      <window.TabBar active="tonight" />
    </window.Phone>
  );
}

// ── Full rotation ──────────────────────────────────────────────
function RotationScreen() {
  const order = _D.turnOrder();
  return (
    <window.Phone>
      <window.TopBar title="The order" back="Tonight" />
      <window.Screen tabbar={false}>
        <CBanner style={{ marginTop: 8 }}>Fewest picks goes first. Ties go to whoever picked longest ago, so everyone gets a fair turn. No voting.</CBanner>
        <div style={{ marginTop: 12 }}>
          {order.map((m, i) => (
            <CRow key={m.id} name={m.name} highlighted={i === 0}
              leading={<span style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 16, fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: i === 0 ? "var(--accent-strong)" : "var(--text-tertiary)" }}>{i + 1}</span><_core_DS.Avatar name={m.name} /></span>}
              meta={`${_D.picksLabel(m.servedCount)} · last ${_D.fmtDate(m.lastPickedOn)}`}
              trailing={i === 0 ? <CBadge solid>Next up</CBadge> : null}
              divider={i < order.length - 1} />
          ))}
        </div>
        <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
          <CButton variant="secondary" size="sm">{`Skip ${order[0].name.split(" ")[0]}'s turn`}</CButton>
        </div>
        <div style={{ marginTop: 18, fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.45 }}>Guests and inactive members don't enter the rotation.</div>
      </window.Screen>
    </window.Phone>
  );
}

function TonightFilmScreen() { return <PlannedHomeScreen tonight />; }

Object.assign(window, { HomeScreen, PlannedHomeScreen, TonightFilmScreen, RotationScreen });
