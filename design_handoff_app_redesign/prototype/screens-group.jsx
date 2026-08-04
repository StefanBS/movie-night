// Movie Night — "the group": The Club (members), member profile, add member.

const _grp_DS = window.MovieNightDesignSystem_b54ad3;
const { Avatar: GAvatar, Badge: GBadge, Button: GButton, Input: GInput } = _grp_DS;
const _GD = window.MNData;

function AddBtn() {
  return (
    <div style={{ width: 38, height: 38, borderRadius: "var(--radius-md)", display: "grid", placeItems: "center", background: "var(--accent)", boxShadow: "0 2px 10px rgba(246,139,54,0.35)" }}>
      <i data-lucide="plus" style={{ width: 20, height: 20, color: "var(--text-on-accent)" }}></i>
    </div>
  );
}

function MemberLine({ m, rank, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 6px", borderBottom: last ? "none" : "1px solid var(--border-hairline)", cursor: "pointer", opacity: m.status === "inactive" ? 0.55 : 1 }}>
      {rank != null && <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: rank === 1 ? "var(--accent-strong)" : "var(--text-tertiary)", width: 16, textAlign: "center", fontWeight: 700 }}>{rank}</span>}
      <GAvatar name={m.name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--text-primary)" }}>{m.name}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{_GD.picksLabel(m.servedCount)} · last {_GD.fmtDate(m.lastPickedOn)}</div>
      </div>
      {rank === 1 ? <GBadge>Next up</GBadge> : <i data-lucide="chevron-right" style={{ width: 18, height: 18, color: "var(--text-tertiary)" }}></i>}
    </div>
  );
}

// ── The Club (tab) ─────────────────────────────────────────────
function MembersScreen() {
  const order = _GD.turnOrder();
  const guests = _GD.members.filter((m) => m.role === "guest" && m.status === "active");
  const inactive = _GD.members.filter((m) => m.status === "inactive");
  return (
    <window.Phone>
      <window.TopBar kind="tab" title="The Club" group={`${_GD.members.filter((m) => m.status === "active").length} members · ${order.length} in rotation`} right={<AddBtn />} />
      <window.Screen>
        <window.SectionLabel>In rotation</window.SectionLabel>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {order.map((m, i) => <MemberLine key={m.id} m={m} rank={i + 1} last={i === order.length - 1} />)}
        </div>

        {guests.length > 0 && (
          <>
            <window.SectionLabel>Guests · not in rotation</window.SectionLabel>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {guests.map((m, i) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 6px", borderBottom: i < guests.length - 1 ? "1px solid var(--border-hairline)" : "none", cursor: "pointer" }}>
                  <GAvatar name={m.name} />
                  <div style={{ flex: 1 }}><div style={{ fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--text-primary)" }}>{m.name}</div></div>
                  <GBadge tone="neutral">Guest</GBadge>
                </div>
              ))}
            </div>
          </>
        )}

        {inactive.length > 0 && (
          <>
            <window.SectionLabel>Inactive</window.SectionLabel>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {inactive.map((m, i) => <MemberLine key={m.id} m={m} last={i === inactive.length - 1} />)}
            </div>
          </>
        )}
      </window.Screen>
      <window.TabBar active="club" />
    </window.Phone>
  );
}

// ── Member profile ─────────────────────────────────────────────
function MemberProfileScreen() {
  const m = _GD.byId("m-priya");
  const picks = _GD.picksFor(m.id);
  const rank = _GD.turnOrder().findIndex((x) => x.id === m.id) + 1;
  return (
    <window.Phone>
      <window.TopBar title="" back="The Club" right={<i data-lucide="ellipsis" style={{ width: 20, height: 20, color: "var(--text-secondary)" }}></i>} />
      <window.Screen tabbar={false}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginTop: 8 }}>
          <GAvatar name={m.name} size="lg" style={{ width: 76, height: 76, fontSize: 28 }} />
          <div style={{ fontFamily: "var(--font-display)", fontSize: 32, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)", marginTop: 14, whiteSpace: "nowrap" }}>{m.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <GBadge tone="neutral">Core</GBadge>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>since {_GD.fmtDate(m.joinedOn, true)}</span>
          </div>
        </div>

        {/* stats */}
        <div style={{ display: "flex", gap: 14, padding: "16px 18px", marginTop: 22, background: "var(--surface-card)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-lg)" }}>
          <div style={{ flex: 1 }}><window.Stat value={m.servedCount} label="Picks" /></div>
          <div style={{ width: 1, background: "var(--border-hairline)" }} />
          <div style={{ flex: 1 }}><window.Stat value={_GD.fmtDate(m.lastPickedOn)} label="Last pick" /></div>
          <div style={{ width: 1, background: "var(--border-hairline)" }} />
          <div style={{ flex: 1 }}><window.Stat value={`#${rank}`} label="In line" accent /></div>
        </div>

        <window.SectionLabel>{m.name.split(" ")[0]}'s picks</window.SectionLabel>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {picks.map((n, i) => {
            const mv = _GD.movies[n.movie];
            return (
              <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 4px", borderBottom: i < picks.length - 1 ? "1px solid var(--border-hairline)" : "none", cursor: "pointer" }}>
                <window.Poster id={n.movie} w={40} h={60} showTitle={false} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)" }}>{mv.title} </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>{mv.year}</span>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>{_GD.fmtDate(n.date)}</span>
              </div>
            );
          })}
        </div>
      </window.Screen>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25, padding: "14px 20px 30px", background: "linear-gradient(transparent, var(--night-900) 26%)", display: "flex", gap: 10 }}>
        <GButton variant="secondary" fullWidth>Deactivate</GButton>
      </div>
    </window.Phone>
  );
}

// ── Add member ─────────────────────────────────────────────────
function AddMemberScreen() {
  const [role, setRole] = React.useState("core");
  return (
    <window.Phone>
      <window.TopBar title="Add member" back="The Club" />
      <window.Screen tabbar={false}>
        <window.SectionLabel>Their name</window.SectionLabel>
        <GInput placeholder="e.g. Alex Rivera" />

        <window.SectionLabel>Join as</window.SectionLabel>
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { id: "core", label: "Core", note: "Enters the pick rotation" },
            { id: "guest", label: "Guest", note: "Watches, never picks" },
          ].map((opt) => {
            const on = role === opt.id;
            return (
              <div key={opt.id} onClick={() => setRole(opt.id)} style={{
                flex: 1, cursor: "pointer", padding: "14px 14px", borderRadius: "var(--radius-md)",
                background: on ? "var(--surface-spotlight)" : "var(--surface-card)",
                boxShadow: on ? "inset 0 0 0 1.5px var(--accent)" : "inset 0 0 0 1px var(--border-hairline)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{opt.label}</span>
                  {on && <i data-lucide="check" style={{ width: 17, height: 17, color: "var(--accent-strong)" }}></i>}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.4 }}>{opt.note}</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 20, fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--text-tertiary)", lineHeight: "var(--leading-normal)" }}>
          New core members start with zero picks, so they'll come up first — that's the rotation keeping things fair.
        </div>
      </window.Screen>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25, padding: "14px 20px 30px", background: "linear-gradient(transparent, var(--night-900) 26%)" }}>
        <GButton fullWidth>Add to the club</GButton>
      </div>
    </window.Phone>
  );
}

Object.assign(window, { MembersScreen, MemberProfileScreen, AddMemberScreen });
