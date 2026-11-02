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
function PlannedHomeScreen() {
  const order = _D.turnOrder();
  const s = _D.scheduledNight;
  const picker = _D.byId(s.pickerId);
  return (
    <window.Phone>
      <window.TopBar kind="home" group={_D.group.name} right={<GearBtn />} />
      <window.Screen>
        <CUpNext style={{ marginTop: 18 }} countdown={_D.countdownLabel(s.date)} date={_D.fmtWeekdayDate(s.date)} time={s.repeat.label} picker={picker.name} coming={s.presentIds.map((id) => _D.byId(id).name)} />
        <OnDeck order={order} label="Then" />
        <div style={{ marginTop: 8 }}><CButton variant="ghost" size="sm" style={{ color: "var(--text-primary)" }}>Plan another night →</CButton></div>
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

Object.assign(window, { HomeScreen, PlannedHomeScreen, RotationScreen });
