// Movie Night — "running the night" flow. A night no longer has to be tonight:
// it opens with a WHEN step (date picker). A future date schedules the night
// (picker set now, movie chosen on the night); tonight runs straight through.
// Flow: When → Who's here → The pick → Recorded / Scheduled.

const _night_DS = window.MovieNightDesignSystem_b54ad3;
const { Avatar: NAvatar, Badge: NBadge, Button: NButton, Input: NInput } = _night_DS;
const _ND = window.MNData;

const STEP_LABELS = ["When", "Here", "Pick", "Done"];
function Stepper({ step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
      {STEP_LABELS.map((s, i) => {
        const on = i + 1 === step, done = i + 1 < step;
        return (
          <React.Fragment key={s}>
            {i > 0 && <div style={{ flex: 1, height: 1, background: done ? "var(--accent)" : "var(--border-hairline)" }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{
                width: 18, height: 18, borderRadius: "50%", display: "grid", placeItems: "center",
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                background: on || done ? "var(--accent)" : "var(--surface-subtle)",
                color: on || done ? "var(--text-on-accent)" : "var(--text-tertiary)",
              }}>{done ? "✓" : i + 1}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: on ? "var(--accent-strong)" : "var(--text-tertiary)" }}>{s}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Step 1: When ───────────────────────────────────────────────
function NightDateScreen() {
  const [sel, setSel] = React.useState("2026-06-19");
  const [month, setMonth] = React.useState(new Date(2026, 5, 1));
  const moveMonth = (dir) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + dir, 1));
  const chips = [
    { label: "Tonight", date: _ND.today },
    { label: "Fri 19", date: "2026-06-19" },
    { label: "Sat 20", date: "2026-06-20" },
  ];
  const future = _ND.daysUntil(sel) > 0;

  return (
    <window.Phone>
      <window.TopBar title="New night" back="Cancel" />
      <window.Screen tabbar={false}>
        <Stepper step={1} />
        <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)", marginTop: 18 }}>When's the night?</div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--text-secondary)", marginTop: 6, lineHeight: "var(--leading-normal)" }}>Tonight, or pick any date to plan ahead. We'll remind everyone.</div>

        {/* quick chips */}
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          {chips.map((c) => {
            const on = c.date === sel;
            return (
              <div key={c.label} onClick={() => { setSel(c.date); setMonth(new Date(2026, 5, 1)); }} style={{
                padding: "9px 15px", borderRadius: "var(--radius-full)", cursor: "pointer",
                fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600,
                background: on ? "var(--accent)" : "var(--surface-card)",
                color: on ? "var(--text-on-accent)" : "var(--text-secondary)",
                boxShadow: on ? "none" : "inset 0 0 0 1px var(--border-hairline)",
              }}>{c.label}</div>
            );
          })}
        </div>

        {/* calendar */}
        <div style={{ marginTop: 18, padding: "16px 14px", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-lg)" }}>
          <window.Calendar value={sel} month={month} onPick={setSel} onMonth={moveMonth} />
        </div>
      </window.Screen>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25, padding: "14px 20px 30px", background: "linear-gradient(transparent, var(--night-900) 26%)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{future ? "Planning" : "Tonight"}</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--accent-strong)" }}>{_ND.relativeLabel(sel)}</span>
        </div>
        <NButton fullWidth>Next: who's coming  →</NButton>
      </div>
    </window.Phone>
  );
}

// ── Step 2: Who's here ─────────────────────────────────────────
function NightAttendanceScreen() {
  const date = _ND.scheduledNight.date; // demo: a night planned for Fri Jun 19
  const future = _ND.daysUntil(date) > 0;
  const core = _ND.members.filter((m) => m.status === "active");
  const [present, setPresent] = React.useState(() => new Set(_ND.scheduledNight.presentIds));
  const toggle = (id) => setPresent((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const picker = _ND.turnOrder().find((m) => present.has(m.id));

  return (
    <window.Phone>
      <window.TopBar title="New night" back="When" />
      <window.Screen tabbar={false}>
        <Stepper step={2} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, gap: 12 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)", whiteSpace: "nowrap" }}>{_ND.fmtWeekdayDate(date)}</div>
          <window.DateChip accent>{_ND.relativeLabel(date)}</window.DateChip>
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--text-secondary)", marginTop: 6, lineHeight: "var(--leading-normal)" }}>{future ? "Who's planning to come? The next-up member who's in gets the pick." : "Tap who made it. Tonight's pick goes to whoever's next up and here."}</div>

        <window.SectionLabel>{future ? "Who's coming?" : "Who's here?"}</window.SectionLabel>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {core.map((m) => {
            const here = present.has(m.id);
            const isPicker = picker && picker.id === m.id;
            return (
              <div key={m.id} onClick={() => toggle(m.id)} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 10px", cursor: "pointer",
                background: isPicker ? "var(--surface-spotlight)" : "transparent",
                borderRadius: isPicker ? "var(--radius-md)" : 0,
                boxShadow: isPicker ? "inset 0 0 0 1px var(--accent-glow)" : "none",
                borderBottom: isPicker ? "none" : "1px solid var(--border-hairline)",
                opacity: here ? 1 : 0.5,
              }}>
                <NAvatar name={m.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--text-primary)" }}>{m.name}</div>
                  {isPicker && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent-strong)", marginTop: 2, letterSpacing: "0.04em" }}>GETS THE PICK</div>}
                </div>
                {here
                  ? <NBadge tone="accent" solid>✓ In</NBadge>
                  : <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Out</span>}
              </div>
            );
          })}
        </div>
      </window.Screen>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25, padding: "14px 20px 30px", background: "linear-gradient(transparent, var(--night-900) 26%)" }}>
        <NButton fullWidth>{future ? `Schedule — ${picker ? picker.name.split(" ")[0] + " picks" : "set the night"}  →` : `Next — ${picker ? picker.name.split(" ")[0] + " picks" : "choose movie"}  →`}</NButton>
      </div>
    </window.Phone>
  );
}

// ── Step 3: Choose the movie (tonight only) ────────────────────
function NightChooseScreen() {
  const picker = _ND.turnOrder()[0];
  const results = ["past-lives", "perfect-days", "fallen", "strangers", "aftersun"];
  return (
    <window.Phone>
      <window.TopBar title="The pick" back="Back" />
      <window.Screen tabbar={false}>
        <Stepper step={3} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, padding: "12px 14px", background: "var(--surface-spotlight)", borderRadius: "var(--radius-md)", boxShadow: "inset 0 0 0 1px var(--accent-glow)" }}>
          <NAvatar name={picker.name} />
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent-strong)", textTransform: "uppercase", letterSpacing: "0.06em" }}>✦ Picking tonight</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)", marginTop: 2, whiteSpace: "nowrap" }}>{picker.name}</div>
          </div>
        </div>

        <window.SectionLabel>Find a film</window.SectionLabel>
        <NInput placeholder="Search a film title…" addon={<NButton>Search</NButton>} />

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column" }}>
          {results.map((id, i) => {
            const mv = _ND.movies[id];
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 6px", borderBottom: i < results.length - 1 ? "1px solid var(--border-hairline)" : "none", cursor: "pointer" }}>
                <window.Poster id={id} w={42} h={63} showTitle={false} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)" }}>{mv.title} </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>{mv.year}</span>
                </div>
                <i data-lucide="chevron-right" style={{ width: 18, height: 18, color: "var(--text-tertiary)" }}></i>
              </div>
            );
          })}
        </div>
      </window.Screen>
    </window.Phone>
  );
}

// ── Step 4a: Recorded (tonight) ────────────────────────────────
function NightRecordedScreen() {
  const picker = _ND.turnOrder()[0];
  const present = ["m-tomas", "m-priya", "m-dana", "m-marcus", "m-jess"];
  return (
    <window.Phone glow>
      <window.TopBar title="Tonight" back="" />
      <window.Screen tabbar={false}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginTop: 12 }}>
          <window.Poster id="past-lives" w={150} h={222} radius="var(--radius-lg)" showTitle={false} style={{ boxShadow: "var(--shadow-lg), 0 0 44px rgba(246,139,54,0.28)" }} />
          <div style={{ marginTop: 20 }}><NBadge tone="accent" solid>Recorded ✓</NBadge></div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 34, lineHeight: 1.05, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)", marginTop: 14 }}>Past Lives</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-tertiary)", marginTop: 6 }}>2023 · 1h 46m</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 20 }}>
            <NAvatar name={picker.name} size="sm" />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--text-secondary)" }}>Picked by <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{picker.name}</span> · {_ND.fmtDate(_ND.today)}</span>
          </div>
        </div>
        <window.SectionLabel style={{ textAlign: "center" }}>Who watched</window.SectionLabel>
        <div style={{ display: "flex", justifyContent: "center" }}>
          {present.map((id, i) => (
            <div key={id} style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: "50%", boxShadow: "0 0 0 3px var(--night-900)" }}>
              <NAvatar name={_ND.byId(id).name} />
            </div>
          ))}
        </div>
      </window.Screen>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25, padding: "14px 20px 30px", background: "linear-gradient(transparent, var(--night-900) 26%)", display: "flex", flexDirection: "column", gap: 8 }}>
        <NButton fullWidth>Done — back to rotation</NButton>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <NButton variant="ghost" size="sm" style={{ color: "var(--text-secondary)" }}>Change movie</NButton>
        </div>
      </div>
    </window.Phone>
  );
}

// ── Step 4b: Scheduled (a future night) ────────────────────────
function NightScheduledScreen() {
  const s = _ND.scheduledNight;
  const picker = _ND.byId(s.pickerId);
  return (
    <window.Phone glow>
      <window.TopBar title="New night" back="" />
      <window.Screen tabbar={false}>
        {/* date hero */}
        <div style={{ marginTop: 14, borderRadius: "var(--radius-xl)", padding: "26px 24px", background: "var(--surface-dark)", boxShadow: "var(--glow-spotlight)", position: "relative", overflow: "hidden", textAlign: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(80% 55% at 50% 0%, rgba(246,139,54,0.24), transparent 62%)", pointerEvents: "none" }} />
          <div style={{ position: "relative", display: "inline-flex" }}><NBadge tone="accent" solid>Scheduled ✓</NBadge></div>
          <div style={{ position: "relative", fontFamily: "var(--font-display)", fontSize: 40, lineHeight: 1.04, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)", marginTop: 16 }}>{_ND.weekday(s.date, true)}</div>
          <div style={{ position: "relative", fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text-secondary)", letterSpacing: "var(--tracking-display)", marginTop: 2 }}>{_ND.fmtDate(s.date, true)}</div>
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent-strong)", textTransform: "uppercase", letterSpacing: "var(--tracking-caption)" }}>
            <i data-lucide="clock" style={{ width: 13, height: 13 }}></i>{_ND.countdownLabel(s.date)}
          </div>
          <div style={{ position: "relative", display: "flex", justifyContent: "center", marginTop: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: "var(--radius-full)", background: "var(--surface-card)", boxShadow: "inset 0 0 0 1px var(--border-hairline)", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <i data-lucide="repeat" style={{ width: 12, height: 12, color: "var(--accent-strong)" }}></i>{s.repeat.label}
            </span>
          </div>
        </div>

        {/* picker */}
        <window.SectionLabel>On the night</window.SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px", background: "var(--surface-spotlight)", borderRadius: "var(--radius-md)", boxShadow: "inset 0 0 0 1px var(--accent-glow)" }}>
          <NAvatar name={picker.name} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 600, color: "var(--text-primary)" }}>{picker.name} picks</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", marginTop: 2, letterSpacing: "0.03em" }}>CHOOSES THE FILM THAT NIGHT</div>
          </div>
          <NBadge>✦ Up</NBadge>
        </div>

        {/* who's coming */}
        <window.SectionLabel>Coming · {s.presentIds.length}</window.SectionLabel>
        <div style={{ display: "flex", alignItems: "center" }}>
          {s.presentIds.map((id, i) => (
            <div key={id} style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: "50%", boxShadow: "0 0 0 3px var(--night-900)" }}>
              <NAvatar name={_ND.byId(id).name} />
            </div>
          ))}
        </div>
      </window.Screen>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25, padding: "14px 20px 30px", background: "linear-gradient(transparent, var(--night-900) 26%)", display: "flex", flexDirection: "column", gap: 8 }}>
        <NButton fullWidth>Done</NButton>
        <div style={{ display: "flex", justifyContent: "center", gap: 18 }}>
          <NButton variant="ghost" size="sm" style={{ color: "var(--text-secondary)" }}>Add to calendar</NButton>
          <NButton variant="ghost" size="sm" style={{ color: "var(--text-secondary)" }}>Notify the group</NButton>
        </div>
      </div>
    </window.Phone>
  );
}

Object.assign(window, { NightDateScreen, NightAttendanceScreen, NightChooseScreen, NightRecordedScreen, NightScheduledScreen });
