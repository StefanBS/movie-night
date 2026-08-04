// Movie Night — setup & rules: Settings and the first-run Welcome.

const _set_DS = window.MovieNightDesignSystem_b54ad3;
const { Badge: XBadge, Button: XButton, Input: XInput } = _set_DS;
const _XD = window.MNData;

function Toggle({ on }) {
  return (
    <div style={{ width: 44, height: 26, borderRadius: 999, padding: 3, background: on ? "var(--accent)" : "var(--night-600)", transition: "background 130ms", flex: "none" }}>
      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", transform: on ? "translateX(18px)" : "translateX(0)", transition: "transform 130ms", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
    </div>
  );
}

function Row({ icon, label, sub, value, trailing, danger, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 14px", borderBottom: last ? "none" : "1px solid var(--border-hairline)", cursor: "pointer" }}>
      {icon && <i data-lucide={icon} style={{ width: 19, height: 19, color: danger ? "var(--text-danger)" : "var(--text-secondary)", flex: "none" }}></i>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, color: danger ? "var(--text-danger)" : "var(--text-primary)" }}>{label}</div>
        {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", marginTop: 3, lineHeight: 1.4 }}>{sub}</div>}
      </div>
      {value && <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--text-secondary)" }}>{value}</span>}
      {trailing}
    </div>
  );
}

function Group({ children }) {
  return <div style={{ background: "var(--surface-card)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>{children}</div>;
}

// ── Settings (tab) ─────────────────────────────────────────────
function SettingsScreen() {
  return (
    <window.Phone>
      <window.TopBar kind="tab" title="Settings" />
      <window.Screen>
        {/* the one rule — brand statement */}
        <div style={{ marginTop: 12, padding: "22px 20px", borderRadius: "var(--radius-lg)", background: "var(--surface-dark)", position: "relative", overflow: "hidden", boxShadow: "inset 0 0 0 1px var(--border-hairline)" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 60% at 100% 0%, rgba(246,139,54,0.16), transparent 60%)", pointerEvents: "none" }} />
          <div style={{ position: "relative", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent-strong)", textTransform: "uppercase", letterSpacing: "var(--tracking-caption)" }}>The house rule</div>
          <div style={{ position: "relative", fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1.12, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)", marginTop: 10 }}>One pick a night. No voting, no vetoing.</div>
          <div style={{ position: "relative", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--text-secondary)", marginTop: 10, lineHeight: "var(--leading-normal)" }}>The app tracks who's picked and proposes whose turn is next, so it's always fair.</div>
        </div>

        <window.SectionLabel>Group</window.SectionLabel>
        <Group>
          <Row icon="users-round" label="Group name" value={_XD.group.name} trailing={<i data-lucide="chevron-right" style={{ width: 18, height: 18, color: "var(--text-tertiary)" }}></i>} />
          <Row icon="calendar" label="Movie nights since" value={_XD.fmtDate(_XD.group.since, true)} last />
        </Group>

        <window.SectionLabel>Rotation</window.SectionLabel>
        <Group>
          <Row icon="shuffle" label="Allow skipping a turn" sub="Pass your pick so someone else chooses" trailing={<Toggle on />} />
          <Row icon="user-plus" label="Guests can pick" sub="Off — guests watch but never pick" trailing={<Toggle on={false} />} last />
        </Group>

        <window.SectionLabel>Notifications</window.SectionLabel>
        <Group>
          <Row icon="bell" label="“It's your turn” reminder" trailing={<Toggle on />} />
          <Row icon="clapperboard" label="Night recap" sub="A summary after each night" trailing={<Toggle on />} last />
        </Group>

        <window.SectionLabel style={{ color: "var(--text-danger)" }}>Danger zone</window.SectionLabel>
        <Group>
          <Row icon="rotate-ccw" label="Reset pick history" danger />
          <Row icon="log-out" label="Leave group" danger last />
        </Group>
      </window.Screen>
      <window.TabBar active="settings" />
    </window.Phone>
  );
}

// ── First-run Welcome ──────────────────────────────────────────
function WelcomeScreen() {
  return (
    <window.Phone glow>
      <div style={{ flex: 1, position: "relative", zIndex: 10, display: "flex", flexDirection: "column", padding: "0 28px", overflow: "hidden" }}>
        {/* marquee */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <img src="../../assets/logomark.svg" alt="" style={{ width: 92, height: 92, filter: "drop-shadow(0 0 26px rgba(246,139,54,0.45))" }} />
          <div style={{ fontFamily: "var(--font-display)", fontSize: 52, lineHeight: 1, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)", marginTop: 26 }}>Movie Night</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--text-secondary)", marginTop: 14, lineHeight: "var(--leading-normal)", maxWidth: 260 }}>
            Pick a movie together, without the squabble. Everyone gets their turn.
          </div>

          {/* the rule, stated up front */}
          <div style={{ marginTop: 32, width: "100%", padding: "18px 18px", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", textAlign: "left" }}>
            {[
              "Each night, one member's pick is law.",
              "The app remembers what you watched.",
              "It proposes whose turn is next — fairly.",
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--accent-strong)", marginTop: 1 }}>{i + 1}</span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--text-primary)", lineHeight: "var(--leading-normal)" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ paddingBottom: 40, display: "flex", flexDirection: "column", gap: 10 }}>
          <XButton fullWidth>Start a group  →</XButton>
          <div style={{ textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--text-secondary)" }}>
            Joining friends?  <span style={{ color: "var(--accent-strong)", fontWeight: 600 }}>Enter an invite code</span>
          </div>
        </div>
      </div>
    </window.Phone>
  );
}

Object.assign(window, { SettingsScreen, WelcomeScreen });
