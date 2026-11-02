// Movie Night — "the group": The Club, member profile, add member.

const _grp_DS = window.MovieNightDesignSystem_b54ad3;
const { Avatar: GAvatar, Badge: GBadge, Button: GButton, Input: GInput, IconButton: GIcon, MemberRow: GRow } = _grp_DS;
const _GD = window.MNData;

function AddBtn() {
  return <GIcon label="Add member" filled><i data-lucide="plus" style={{ width: 20, height: 20 }}></i></GIcon>;
}
const Chev = () => <i data-lucide="chevron-right" style={{ width: 18, height: 18 }}></i>;

// ── The Club (tab) ─────────────────────────────────────────────
function MembersScreen() {
  const order = _GD.turnOrder();
  const guests = _GD.members.filter((m) => m.role === "guest" && m.status === "active");
  const inactive = _GD.members.filter((m) => m.status === "inactive");
  return (
    <window.Phone>
      <window.TopBar kind="tab" title="The Club" group={`${_GD.members.filter((m) => m.status === "active").length} members, ${order.length} in rotation.`} right={<AddBtn />} />
      <window.Screen>
        <window.SectionLabel style={{ marginTop: 26 }}>In rotation</window.SectionLabel>
        {order.map((m, i) => (
          <GRow key={m.id} name={m.name} highlighted={i === 0} onClick={() => {}}
            meta={`${_GD.picksLabel(m.servedCount)} · last ${_GD.fmtDate(m.lastPickedOn)}`}
            trailing={i === 0 ? <GBadge solid>Next up</GBadge> : <Chev />} divider={i < order.length - 1} />
        ))}
        {guests.length > 0 && (
          <>
            <window.SectionLabel style={{ marginTop: 28 }}>Guests · not in rotation</window.SectionLabel>
            {guests.map((m, i) => <GRow key={m.id} name={m.name} trailing={<GBadge tone="neutral">Guest</GBadge>} divider={i < guests.length - 1} />)}
          </>
        )}
        {inactive.length > 0 && (
          <>
            <window.SectionLabel style={{ marginTop: 28 }}>Inactive</window.SectionLabel>
            {inactive.map((m, i) => <GRow key={m.id} name={m.name} muted meta={`${_GD.picksLabel(m.servedCount)} · last ${_GD.fmtDate(m.lastPickedOn)}`} trailing={<Chev />} divider={i < inactive.length - 1} />)}
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
  const ord = ["1st", "2nd", "3rd"][rank - 1] || rank + "th";
  return (
    <window.Phone>
      <window.TopBar title="" back="The Club" right={<i data-lucide="ellipsis" style={{ width: 20, height: 20, color: "var(--text-secondary)" }}></i>} />
      <window.Screen tabbar={false}>
        <div style={{ marginTop: 18 }}>
          <GAvatar name={m.name} size={64} />
          <div style={{ fontWeight: 800, fontSize: 44, lineHeight: 0.95, letterSpacing: "-0.045em", marginTop: 18 }}>{m.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <GBadge tone="neutral">Core</GBadge>
            <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Since {_GD.fmtDate(m.joinedOn, true)}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 30, marginTop: 26, paddingTop: 20, borderTop: "1px solid var(--border-hairline)" }}>
          <window.Stat value={m.servedCount} label="Picks" />
          <window.Stat value={_GD.fmtDate(m.lastPickedOn)} label="Last pick" />
          <window.Stat value={ord} label="In line" />
        </div>
        <window.SectionLabel style={{ marginTop: 30 }}>{m.name.split(" ")[0]}'s picks</window.SectionLabel>
        {picks.map((n, i) => {
          const mv = _GD.movies[n.movie];
          return (
            <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderBottom: i < picks.length - 1 ? "1px solid var(--border-hairline)" : "none", cursor: "pointer" }}>
              <window.Poster id={n.movie} w={40} h={60} showTitle={false} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <window.Film size={19}>{mv.title}</window.Film>
                <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 2 }}>{mv.year}</div>
              </div>
              <span style={{ fontSize: 13, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{_GD.fmtDate(n.date)}</span>
            </div>
          );
        })}
      </window.Screen>
      <window.Footer><GButton variant="secondary" fullWidth>Deactivate</GButton></window.Footer>
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
        <window.SectionLabel style={{ marginTop: 18 }}>Their name</window.SectionLabel>
        <GInput placeholder="e.g. Alex Rivera" />
        <window.SectionLabel style={{ marginTop: 26 }}>Join as</window.SectionLabel>
        <div style={{ display: "flex", gap: 10 }}>
          {[{ id: "core", label: "Core", note: "Enters the pick rotation" }, { id: "guest", label: "Guest", note: "Watches, never picks" }].map((opt) => {
            const on = role === opt.id;
            return (
              <div key={opt.id} onClick={() => setRole(opt.id)} style={{ flex: 1, cursor: "pointer", padding: 16, borderRadius: "var(--radius-lg)", background: "var(--surface-card)", boxShadow: on ? "inset 0 0 0 2px var(--text-primary)" : "inset 0 0 0 1px var(--border-hairline)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 17, fontWeight: 700 }}>{opt.label}</span>
                  {on && <i data-lucide="check" style={{ width: 17, height: 17 }}></i>}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.4 }}>{opt.note}</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 20, fontSize: 14, color: "var(--text-tertiary)", lineHeight: 1.45 }}>New core members start with zero picks, so they'll come up first. That's the rotation keeping things fair.</div>
      </window.Screen>
      <window.Footer><GButton fullWidth>Add to the club</GButton></window.Footer>
    </window.Phone>
  );
}

Object.assign(window, { MembersScreen, MemberProfileScreen, AddMemberScreen });
