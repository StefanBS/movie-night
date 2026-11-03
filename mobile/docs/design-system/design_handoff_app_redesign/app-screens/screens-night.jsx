// Movie Night — new-night flow: Date → People → Movie → Done (Recorded / Scheduled).

const _night_DS = window.MovieNightDesignSystem_b54ad3;
const { Avatar: NAvatar, Badge: NBadge, Button: NButton, Input: NInput, Stepper: NStepper } = _night_DS;
const _ND = window.MNData;

function Stepper({ step }) {
  return <NStepper current={step - 1} style={{ marginTop: 6 }} />;
}
const H1 = ({ children, style }) => <div style={{ fontWeight: 800, fontSize: 32, lineHeight: 1.02, letterSpacing: "-0.04em", marginTop: 24, ...style }}>{children}</div>;
const Lede = ({ children }) => <div style={{ fontSize: 15, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.45 }}>{children}</div>;

// ── Step 1: When ───────────────────────────────────────────────
function NightDateScreen() {
  const [sel, setSel] = React.useState("2026-06-19");
  const [month, setMonth] = React.useState(new Date(2026, 5, 1));
  const moveMonth = (dir) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + dir, 1));
  const chips = [{ label: "Tonight", date: _ND.today }, { label: "Fri 19", date: "2026-06-19" }, { label: "Sat 20", date: "2026-06-20" }];
  const future = _ND.daysUntil(sel) > 0;
  return (
    <window.Phone>
      <window.TopBar title="New night" back="Cancel" />
      <window.Screen tabbar={false}>
        <Stepper step={1} />
        <H1>When's the night?</H1>
        <Lede>Tonight, or any date to plan ahead. We'll remind everyone.</Lede>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          {chips.map((c) => {
            const on = c.date === sel;
            return (
              <div key={c.label} onClick={() => { setSel(c.date); setMonth(new Date(2026, 5, 1)); }} style={{ padding: "9px 16px", borderRadius: "var(--radius-full)", cursor: "pointer", fontSize: 14, fontWeight: 600, background: on ? "var(--text-primary)" : "var(--surface-subtle)", color: on ? "var(--surface-page)" : "var(--text-primary)" }}>{c.label}</div>
            );
          })}
        </div>
        <div style={{ marginTop: 18, padding: "18px 16px 10px", background: "var(--surface-card)", borderRadius: "var(--radius-lg)" }}>
          <window.Calendar value={sel} month={month} onPick={setSel} onMonth={moveMonth} />
        </div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 13, padding: "14px 16px", background: "var(--surface-card)", borderRadius: "var(--radius-lg)", cursor: "pointer" }}>
          <i data-lucide="clock" style={{ width: 19, height: 19, color: "var(--text-secondary)", flex: "none" }}></i>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>Start time</span>
          <span style={{ fontSize: 15, color: "var(--text-secondary)" }}>8:00 pm</span>
          <i data-lucide="chevron-right" style={{ width: 18, height: 18, color: "var(--text-tertiary)" }}></i>
        </div>
      </window.Screen>
      <window.Footer>
        {/* One summary line of what's chosen, never the same word twice. */}
        <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 6, fontVariantNumeric: "tabular-nums" }}>
          <b style={{ color: "var(--text-primary)", fontWeight: 700 }}>{_ND.fmtWeekdayDate(sel)}</b> · 8:00 pm{future ? " · " + _ND.countdownLabel(sel) : ""}
        </div>
        <NButton fullWidth>Next: who's coming →</NButton>
      </window.Footer>
    </window.Phone>
  );
}

// ── Step 2: Who's here ─────────────────────────────────────────
function NightAttendanceScreen() {
  const date = _ND.scheduledNight.date;
  const future = _ND.daysUntil(date) > 0;
  const core = _ND.members.filter((m) => m.status === "active");
  const [present, setPresent] = React.useState(() => new Set(_ND.scheduledNight.presentIds));
  const toggle = (id) => setPresent((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const picker = _ND.turnOrder().find((m) => present.has(m.id));
  return (
    <window.Phone>
      <window.TopBar title="New night" back="Date" />
      <window.Screen tabbar={false}>
        <Stepper step={2} />
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <H1 style={{ whiteSpace: "nowrap" }}>{_ND.fmtWeekdayDate(date)}</H1>
          <window.DateChip>{_ND.relativeLabel(date)}</window.DateChip>
        </div>
        <Lede>{future ? "Who's planning to come? The next-up member who's in gets the pick." : "Tap who made it. The pick goes to whoever's next up and here."}</Lede>
        <window.SectionLabel>{future ? "Who's coming?" : "Who's here?"}</window.SectionLabel>
        {core.map((m, i) => {
          const here = present.has(m.id);
          const isPicker = picker && picker.id === m.id;
          return (
            <div key={m.id} onClick={() => toggle(m.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", cursor: "pointer", borderBottom: i < core.length - 1 ? "1px solid var(--border-hairline)" : "none" }}>
              <div style={{ opacity: here ? 1 : 0.4 }}><NAvatar name={m.name} /></div>
              <div style={{ flex: 1, minWidth: 0, opacity: here ? 1 : 0.5 }}>
                <div style={{ fontSize: isPicker ? 18 : 16, fontWeight: isPicker ? 800 : 500, letterSpacing: isPicker ? "-0.02em" : 0 }}>{m.name}</div>
                {isPicker && <div style={{ fontSize: 13, color: "var(--accent-strong)", fontWeight: 600, marginTop: 2 }}>Gets the pick</div>}
              </div>
              <span style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", background: here ? "var(--text-primary)" : "transparent", boxShadow: here ? "none" : "inset 0 0 0 1.5px var(--border-strong)", color: "var(--surface-page)" }}>
                {here && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
              </span>
            </div>
          );
        })}
      </window.Screen>
      <window.Footer>
        <NButton fullWidth>{future ? `Schedule: ${picker ? picker.name.split(" ")[0] + " picks" : "set the night"} →` : `Next: ${picker ? picker.name.split(" ")[0] + " picks" : "choose the film"} →`}</NButton>
      </window.Footer>
    </window.Phone>
  );
}

// ── Step 3: Movie ──────────────────────────────────────────────
// Search first: results appear as you type, no Search button. The picker is
// a credit line with a quiet "Change" beside it; already-watched films say so.
function NightChooseScreen() {
  const picker = _ND.turnOrder()[0];
  const first = picker.name.split(" ")[0];
  const results = ["worst-person", "banshees", "zone", "strangers"];
  const watched = Object.fromEntries(_ND.nights.map((n) => [n.movie, n]));
  return (
    <window.Phone>
      <window.TopBar title="New night" back="People" />
      <window.Screen tabbar={false}>
        <Stepper step={3} />
        <H1>What are we watching?</H1>
        <window.Credit name={picker.name} pending style={{ marginTop: 14 }} action={<NButton variant="ghost" size="sm" style={{ color: "var(--text-primary)" }}>Change</NButton>} />
        <div style={{ marginTop: 18 }}>
          <NInput value="the" onChange={() => {}} placeholder="Search a film title…" />
        </div>
        <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 12 }}>{results.length} films · tap one to make it {first}'s pick</div>
        <div style={{ marginTop: 4 }}>
          {results.map((id, i) => {
            const mv = _ND.movies[id];
            const seen = watched[id];
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderBottom: i < results.length - 1 ? "1px solid var(--border-hairline)" : "none", cursor: "pointer" }}>
                <window.Poster id={id} w={44} h={66} showTitle={false} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><window.Film size={19}>{mv.title}</window.Film></div>
                  <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                    {mv.year} · {mv.runtime}{seen ? " · watched " + _ND.fmtDate(seen.date) : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </window.Screen>
      <window.Footer>
        <div style={{ display: "flex", justifyContent: "center" }}><NButton variant="ghost">{`Skip for now · ${first} can pick later`}</NButton></div>
      </window.Footer>
    </window.Phone>
  );
}

// ── Step 4a: Recorded ──────────────────────────────────────────
function NightRecordedScreen() {
  const picker = _ND.turnOrder()[0];
  const present = ["m-tomas", "m-priya", "m-dana", "m-marcus", "m-jess"];
  return (
    <window.Phone>
      <window.TopBar title="Tonight" back="" />
      <window.Screen tabbar={false}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginTop: 14 }}>
          <window.Poster id="past-lives" w={150} h={225} radius="var(--radius-md)" showTitle={false} style={{ boxShadow: "var(--shadow-lg)" }} />
          <div style={{ marginTop: 22 }}><NBadge>Recorded ✓</NBadge></div>
          <window.Film size={40} style={{ marginTop: 12, display: "block" }}>Past Lives</window.Film>
          <div style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 6 }}>2023 · 1h 46m</div>
          <div style={{ fontSize: 15, color: "var(--text-secondary)", marginTop: 18 }}>Picked by <b style={{ color: "var(--text-primary)", fontWeight: 600 }}>{picker.name.split(" ")[0]}</b> · {_ND.fmtDate(_ND.today)}</div>
        </div>
        <window.SectionLabel style={{ textAlign: "center", marginTop: 28 }}>Who watched</window.SectionLabel>
        <div style={{ display: "flex", justifyContent: "center" }}><window.Stack ids={present} size={36} /></div>
      </window.Screen>
      <window.Footer>
        <NButton fullWidth>Done</NButton>
        <div style={{ display: "flex", justifyContent: "center" }}><NButton variant="ghost" size="sm">Change film</NButton></div>
      </window.Footer>
    </window.Phone>
  );
}

// ── Step 4b: Scheduled ─────────────────────────────────────────
function NightScheduledScreen() {
  const s = _ND.scheduledNight;
  const picker = _ND.byId(s.pickerId);
  return (
    <window.Phone>
      <window.TopBar title="New night" back="" />
      <window.Screen tabbar={false}>
        <div style={{ marginTop: 30 }}>
          <NBadge>Scheduled ✓</NBadge>
          <div style={{ fontWeight: 800, fontSize: 64, lineHeight: 0.92, letterSpacing: "-0.05em", marginTop: 18 }}>{_ND.weekday(s.date, true)}</div>
          <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 30, marginTop: 6 }}>{_ND.fmtDate(s.date, true)}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
            <window.DateChip>{_ND.countdownLabel(s.date)}</window.DateChip>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: "var(--radius-full)", background: "var(--surface-subtle)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}><i data-lucide="repeat" style={{ width: 14, height: 14 }}></i>{s.repeat.label}</span>
          </div>
        </div>
        <window.SectionLabel style={{ marginTop: 32 }}>On the night</window.SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border-hairline)" }}>
          <NAvatar name={picker.name} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>{picker.name}</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>Chooses the film that night</div>
          </div>
          <NBadge solid>Next up</NBadge>
        </div>
        <window.SectionLabel>Coming · {s.presentIds.length}</window.SectionLabel>
        <window.Stack ids={s.presentIds} size={36} />
      </window.Screen>
      <window.Footer>
        <NButton fullWidth>Done</NButton>
        <div style={{ display: "flex", justifyContent: "center", gap: 18 }}>
          <NButton variant="ghost" size="sm">Add to calendar</NButton>
          <NButton variant="ghost" size="sm">Notify the group</NButton>
        </div>
      </window.Footer>
    </window.Phone>
  );
}

Object.assign(window, { NightDateScreen, NightAttendanceScreen, NightChooseScreen, NightRecordedScreen, NightScheduledScreen });
