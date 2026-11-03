// Movie Night — "the group": Club, member profile, add member.

const _grp_DS = window.MovieNightDesignSystem_b54ad3;
const { Avatar: GAvatar, Badge: GBadge, Button: GButton, Input: GInput, IconButton: GIcon, MemberRow: GRow } = _grp_DS;
const _GD = window.MNData;

function AddBtn() {
  return <GIcon label="Add member" filled><i data-lucide="plus" style={{ width: 20, height: 20 }}></i></GIcon>;
}
const Chev = () => <i data-lucide="chevron-right" style={{ width: 18, height: 18 }}></i>;

// ── Club (tab) ─────────────────────────────────────────────
function MembersScreen() {
  const order = _GD.turnOrder();
  const guests = _GD.members.filter((m) => m.role === "guest" && m.status === "active");
  const inactive = _GD.members.filter((m) => m.status === "inactive");
  return (
    <window.Phone>
      <window.TopBar kind="tab" title="Club" group={`${_GD.members.filter((m) => m.status === "active").length} members, ${order.length} in rotation.`} right={<AddBtn />} />
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
// Same left-aligned voice as every other screen: name big, stats on a
// hairline (no boxed card), place in line in plain text (the accent stays
// with the picker). Their picks are the content. Deactivate is a quiet
// action at the end of the page, never a full-width button.
function MemberProfileScreen({ id = "m-priya" }) {
  const m = _GD.byId(id);
  const first = m.name.split(" ")[0];
  const picks = _GD.picksFor(m.id);
  const order = _GD.turnOrder();
  const rank = order.findIndex((x) => x.id === m.id) + 1;
  const ord = ["1st", "2nd", "3rd"][rank - 1] || rank + "th";
  const isNext = rank === 1;
  return (
    <window.Phone>
      <window.TopBar title="" back="Club" />
      <window.Screen tabbar={false}>
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 16 }}>
          <GAvatar name={m.name} size={64} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 40, lineHeight: 0.95, letterSpacing: "-0.045em" }}>{first}</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 8 }}>{m.name} · core since {_GD.fmtDate(m.joinedOn).split(" ")[0]} {m.joinedOn.slice(0, 4)}</div>
          </div>
        </div>
        {isNext && <div style={{ marginTop: 18 }}><GBadge solid>Next up</GBadge></div>}
        <div style={{ display: "flex", gap: 30, marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--border-hairline)" }}>
          <window.Stat value={m.servedCount} label={m.servedCount === 1 ? "Pick" : "Picks"} />
          <window.Stat value={m.lastPickedOn ? _GD.fmtDate(m.lastPickedOn) : "—"} label="Last pick" />
          <window.Stat value={ord} label="In line" />
        </div>
        <window.SectionLabel style={{ marginTop: 30 }}>{first}'s picks</window.SectionLabel>
        {picks.length === 0 ? (
          <div style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.5, paddingTop: 4 }}>
            {isNext ? `No picks yet. ${first} is next up, so the first one is coming.` : `No picks yet. ${first} is ${ord} in line.`}
          </div>
        ) : picks.map((n, i) => {
          const mv = _GD.movies[n.movie];
          return (
            <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderBottom: i < picks.length - 1 ? "1px solid var(--border-hairline)" : "none", cursor: "pointer" }}>
              <window.Poster id={n.movie} w={40} h={60} showTitle={false} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><window.Film size={19}>{mv.title}</window.Film></div>
                <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 2 }}>{mv.year} · {n.presentIds.length} watched</div>
              </div>
              <span style={{ fontSize: 13, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{_GD.fmtDate(n.date)}</span>
            </div>
          );
        })}
        <div style={{ marginTop: 36, paddingTop: 16, borderTop: "1px solid var(--border-hairline)" }}>
          <GButton variant="danger" size="sm">{`Deactivate ${first}`}</GButton>
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", lineHeight: 1.45, marginTop: 2 }}>Leaves the rotation. Their picks stay in Watched.</div>
        </div>
      </window.Screen>
    </window.Phone>
  );
}
function MemberNewScreen() { return <MemberProfileScreen id="m-tomas" />; }

// ── Add member ─────────────────────────────────────────────────
function AddMemberScreen() {
  const [role, setRole] = React.useState("core");
  return (
    <window.Phone>
      <window.TopBar title="Add member" back="Club" />
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

Object.assign(window, { MembersScreen, MemberProfileScreen, MemberNewScreen, AddMemberScreen });
