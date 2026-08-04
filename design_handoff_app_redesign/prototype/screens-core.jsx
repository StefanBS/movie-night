// Movie Night — core-loop screens: Tonight (home), planned-home, full rotation.

const _core_DS = window.MovieNightDesignSystem_b54ad3;
const { Avatar: CAvatar, Badge: CBadge, Button: CButton } = _core_DS;
const _D = window.MNData;

function GearBtn() {
  return (
    <div style={{ width: 38, height: 38, borderRadius: "var(--radius-md)", display: "grid", placeItems: "center", background: "var(--surface-card)", border: "1px solid var(--border-hairline)" }}>
      <i data-lucide="settings" style={{ width: 19, height: 19, color: "var(--text-secondary)" }}></i>
    </div>
  );
}

// Shared ember spotlight — whose turn it is
function SpotlightHero({ next }) {
  return (
    <div style={{
      marginTop: 14, borderRadius: "var(--radius-xl)", padding: "28px 24px 26px",
      background: "var(--surface-dark)", boxShadow: "var(--glow-spotlight)",
      position: "relative", overflow: "hidden",
      display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
    }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(80% 55% at 50% 0%, rgba(246,139,54,0.26), transparent 62%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--accent-strong)", textTransform: "uppercase", letterSpacing: "var(--tracking-caption)" }}>✦ Next up</div>
      <div style={{ position: "relative", marginTop: 18 }}>
        <div style={{ position: "absolute", inset: -8, borderRadius: "50%", background: "radial-gradient(circle, var(--accent-glow), transparent 70%)" }} />
        <CAvatar name={next.name} size="lg" style={{ position: "relative", width: 64, height: 64, fontSize: 24, boxShadow: "0 0 0 2px rgba(246,139,54,0.5)" }} />
      </div>
      <div style={{ position: "relative", fontFamily: "var(--font-display)", fontSize: 38, lineHeight: 1.1, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)", marginTop: 14, whiteSpace: "nowrap" }}>{next.name}</div>
      <div style={{ position: "relative", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--haze-300)", marginTop: 8 }}>
        {next.servedCount === 0 ? "First turn · hasn't picked yet" : `${_D.picksLabel(next.servedCount)} · last ${_D.fmtDate(next.lastPickedOn)}`}
      </div>
    </div>
  );
}

function OnDeck({ order, from = 1 }) {
  const list = order.slice(from, from + 3);
  return (
    <>
      <window.SectionLabel>On deck</window.SectionLabel>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {list.map((m, i) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 4px", borderBottom: i < list.length - 1 ? "1px solid var(--border-hairline)" : "none" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-tertiary)", width: 16 }}>{from + i + 1}</span>
            <CAvatar name={m.name} size="sm" />
            <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--text-primary)" }}>{m.name}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>{_D.picksLabel(m.servedCount)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Tonight (home — no night planned) ──────────────────────────
function HomeScreen() {
  const order = _D.turnOrder();
  const next = order[0];
  return (
    <window.Phone glow>
      <window.TopBar kind="home" group={_D.group.name} right={<GearBtn />} />
      <window.Screen>
        <SpotlightHero next={next} />
        <div style={{ marginTop: 18 }}>
          <CButton fullWidth>Plan a night  →</CButton>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
          <CButton variant="ghost" size="sm" style={{ color: "var(--text-secondary)" }}>{next.name.split(" ")[0]} can't make it — skip turn</CButton>
        </div>
        <OnDeck order={order} />
        <div style={{ marginTop: 14 }}>
          <CButton variant="ghost" size="sm" style={{ color: "var(--accent-strong)", padding: "8px 4px" }}>See full rotation  →</CButton>
        </div>
      </window.Screen>
      <window.TabBar active="tonight" />
    </window.Phone>
  );
}

// ── Tonight (home — a night is on the calendar) ────────────────
function PlannedHomeScreen() {
  const order = _D.turnOrder();
  const s = _D.scheduledNight;
  const picker = _D.byId(s.pickerId);
  return (
    <window.Phone glow>
      <window.TopBar kind="home" group={_D.group.name} right={<GearBtn />} />
      <window.Screen>
        {/* Up next — the scheduled night */}
        <div style={{ marginTop: 14, borderRadius: "var(--radius-xl)", padding: "22px 22px 20px", background: "var(--surface-dark)", boxShadow: "var(--glow-spotlight)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(80% 50% at 50% 0%, rgba(246,139,54,0.22), transparent 62%)", pointerEvents: "none" }} />
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--accent-strong)", textTransform: "uppercase", letterSpacing: "var(--tracking-caption)" }}>✦ Next movie night</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--text-on-accent)", background: "var(--accent)", borderRadius: "var(--radius-full)", padding: "4px 10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <i data-lucide="clock" style={{ width: 12, height: 12 }}></i>{_D.countdownLabel(s.date)}
            </span>
          </div>
          <div style={{ position: "relative", fontFamily: "var(--font-display)", fontSize: 34, lineHeight: 1.05, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)", marginTop: 14 }}>{_D.fmtWeekdayDate(s.date)}</div>
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <i data-lucide="repeat" style={{ width: 13, height: 13, color: "var(--accent-strong)" }}></i>{s.repeat.label}
          </div>

          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 11, marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border-hairline)" }}>
            <CAvatar name={picker.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{picker.name}'s pick</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", marginTop: 2, letterSpacing: "0.03em" }}>CHOOSES THE FILM THAT NIGHT</div>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              {s.presentIds.slice(0, 4).map((id, i) => (
                <div key={id} style={{ marginLeft: i === 0 ? 0 : -10, borderRadius: "50%", boxShadow: "0 0 0 2.5px var(--surface-dark)" }}>
                  <CAvatar name={_D.byId(id).name} size="sm" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <CButton fullWidth>Start the night</CButton>
          <CButton variant="secondary" style={{ flex: "none", paddingLeft: 16, paddingRight: 16 }}>Edit</CButton>
        </div>

        <OnDeck order={order} />
        <div style={{ marginTop: 14 }}>
          <CButton variant="ghost" size="sm" style={{ color: "var(--accent-strong)", padding: "8px 4px" }}>Plan another night  →</CButton>
        </div>
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
        <div style={{ marginTop: 6, marginBottom: 4 }}>
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 14, lineHeight: "var(--leading-normal)", color: "var(--text-secondary)",
            background: "var(--surface-subtle)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-md)", padding: "12px 14px",
          }}>
            Fewest picks goes first. Ties go to whoever picked longest ago — so everyone gets a fair turn. No voting.
          </div>
        </div>

        {order.map((m, i) => {
          const top = i === 0;
          return (
            <div key={m.id} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: top ? "16px 14px" : "14px 6px",
              marginTop: top ? 16 : 0,
              background: top ? "var(--surface-spotlight)" : "transparent",
              borderRadius: top ? "var(--radius-lg)" : 0,
              boxShadow: top ? "inset 0 0 0 1px var(--accent-glow)" : "none",
              borderBottom: top ? "none" : "1px solid var(--border-hairline)",
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: top ? "var(--accent-strong)" : "var(--text-tertiary)", width: 18, textAlign: "center" }}>{i + 1}</span>
              <CAvatar name={m.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: top ? 600 : 400, color: "var(--text-primary)" }}>{m.name}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{_D.picksLabel(m.servedCount)} · last {_D.fmtDate(m.lastPickedOn)}</div>
              </div>
              {top && <CBadge>Next up</CBadge>}
            </div>
          );
        })}

        <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
          <CButton variant="secondary" size="sm">Skip {order[0].name.split(" ")[0]}'s turn</CButton>
        </div>

        <div style={{ marginTop: 22, fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", lineHeight: "var(--leading-normal)" }}>
          Guests and inactive members don't enter the rotation.
        </div>
      </window.Screen>
    </window.Phone>
  );
}

Object.assign(window, { HomeScreen, PlannedHomeScreen, RotationScreen });
