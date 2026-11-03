// Movie Night — setup & rules: Settings and the first-run Welcome.

const _set_DS = window.MovieNightDesignSystem_b54ad3;
const { Button: XButton, Toggle: XToggle } = _set_DS;
const _XD = window.MNData;

function Toggle({ on }) {
  const [v, setV] = React.useState(on);
  return <XToggle value={v} onChange={setV} label="Toggle" />;
}

function Row({ icon, label, sub, value, trailing, danger, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 16px", borderBottom: last ? "none" : "1px solid var(--border-hairline)", cursor: "pointer" }}>
      {icon && <i data-lucide={icon} style={{ width: 19, height: 19, color: danger ? "var(--text-danger)" : "var(--text-secondary)", flex: "none" }}></i>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: danger ? "var(--text-danger)" : "var(--text-primary)" }}>{label}</div>
        {sub && <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
      </div>
      {value && <span style={{ fontSize: 15, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{value}</span>}
      {trailing}
    </div>
  );
}

function Group({ children }) {
  return <div style={{ background: "var(--surface-card)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>{children}</div>;
}
const Chev = () => <i data-lucide="chevron-right" style={{ width: 18, height: 18, color: "var(--text-tertiary)" }}></i>;

// ── Settings (pushed from the gear on Tonight; not a tab) ─────────────────────────────────────────────
function SettingsScreen() {
  return (
    <window.Phone>
      <window.TopBar title="Settings" back="Tonight" />
      <window.Screen tabbar={false}>
        <div style={{ marginTop: 22, paddingBottom: 22, borderBottom: "1px solid var(--border-hairline)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>The house rule</div>
          <div style={{ fontWeight: 800, fontSize: 28, lineHeight: 1.05, letterSpacing: "-0.035em", marginTop: 8 }}>One pick a night.</div>
          <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 24, marginTop: 2 }}>No voting, no vetoing.</div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.45 }}>The app tracks who's picked and proposes whose turn is next, so it's always fair.</div>
        </div>
        <window.SectionLabel>Group</window.SectionLabel>
        <Group>
          <Row icon="users-round" label="Group name" value={_XD.group.name} trailing={<Chev />} />
          <Row icon="calendar" label="Movie nights since" value={_XD.fmtDate(_XD.group.since, true)} last />
        </Group>
        <window.SectionLabel>You</window.SectionLabel>
        <Group>
          <Row icon="smartphone" label={_XD.byId("m-priya").name} sub="This phone belongs to you" trailing={<_set_DS.Avatar name={_XD.byId("m-priya").name} size={28} />} />
          <Row icon="repeat" label="Not you? Switch" trailing={<Chev />} last />
        </Group>
        <window.SectionLabel>Rotation</window.SectionLabel>
        <Group>
          <Row icon="shuffle" label="Allow skipping a turn" sub="Pass your pick so someone else chooses" trailing={<Toggle on />} />
          <Row icon="user-plus" label="Guests can pick" sub="Guests watch but never pick" trailing={<Toggle on={false} />} last />
        </Group>
        <window.SectionLabel>Notifications</window.SectionLabel>
        <Group>
          <Row icon="bell" label="“It's your turn” reminder" trailing={<Toggle on />} />
          <Row icon="clapperboard" label="Night recap" sub="A summary after each night" trailing={<Toggle on />} last />
        </Group>
        <window.SectionLabel>Danger zone</window.SectionLabel>
        <Group>
          <Row icon="rotate-ccw" label="Reset pick history" danger />
          <Row icon="log-out" label="Leave group" danger last />
        </Group>
      </window.Screen>
    </window.Phone>
  );
}

// ── First-run Welcome ──────────────────────────────────────────
function WelcomeScreen() {
  return (
    <window.Phone>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 28px", position: "relative", zIndex: 10 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <_set_DS.Logomark size={56} />
          <div style={{ fontWeight: 800, fontSize: 60, lineHeight: 0.92, letterSpacing: "-0.05em", marginTop: 26 }}>Movie<br />Night</div>
          <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 24, lineHeight: 1.2, marginTop: 14 }}>Everyone gets their turn.</div>
          <div style={{ marginTop: 34 }}>
            {["Each night, one member's pick is law.", "The app remembers what you watched.", "It proposes whose turn is next, fairly."].map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 14, alignItems: "baseline", padding: "12px 0", borderTop: "1px solid var(--border-hairline)" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                <span style={{ fontSize: 16, lineHeight: 1.45 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ paddingBottom: 44, display: "flex", flexDirection: "column", gap: 14 }}>
          <XButton fullWidth size="lg">Start a group</XButton>
          <div style={{ textAlign: "center", fontSize: 14, color: "var(--text-secondary)" }}>Joining friends? <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>Enter an invite code</span></div>
        </div>
      </div>
    </window.Phone>
  );
}

Object.assign(window, { SettingsScreen, WelcomeScreen });
