// Movie Night — scheduling follow-ons: Edit a scheduled night, Repeat
// (recurrence), Reminders, and how a reminder appears (lock-screen push).

const _sch_DS = window.MovieNightDesignSystem_b54ad3;
const { Avatar: KAvatar, Badge: KBadge, Button: KButton } = _sch_DS;
const _KD = window.MNData;

// ── local primitives ──────────────────────────────────────────
function Toggle({ on }) {
  return (
    <div style={{ width: 44, height: 26, borderRadius: 999, padding: 3, background: on ? "var(--accent)" : "var(--night-600)", flex: "none" }}>
      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", transform: on ? "translateX(18px)" : "translateX(0)", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
    </div>
  );
}
function Group({ children }) {
  return <div style={{ background: "var(--surface-card)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>{children}</div>;
}
function Row({ icon, label, sub, value, trailing, danger, last, accentValue }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 14px", borderBottom: last ? "none" : "1px solid var(--border-hairline)", cursor: "pointer" }}>
      {icon && <i data-lucide={icon} style={{ width: 19, height: 19, color: danger ? "var(--text-danger)" : "var(--text-secondary)", flex: "none" }}></i>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, color: danger ? "var(--text-danger)" : "var(--text-primary)" }}>{label}</div>
        {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", marginTop: 3, lineHeight: 1.4 }}>{sub}</div>}
      </div>
      {value && <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: accentValue ? "var(--accent-strong)" : "var(--text-secondary)", fontWeight: accentValue ? 600 : 400 }}>{value}</span>}
      {trailing}
    </div>
  );
}
const Chevron = () => <i data-lucide="chevron-right" style={{ width: 18, height: 18, color: "var(--text-tertiary)" }}></i>;

// ── 1. Edit a scheduled night ──────────────────────────────────
function EditNightScreen() {
  const s = _KD.scheduledNight;
  const picker = _KD.byId(s.pickerId);
  const core = _KD.members.filter((m) => m.status === "active");
  const [present, setPresent] = React.useState(() => new Set(s.presentIds));
  const toggle = (id) => setPresent((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <window.Phone>
      <window.TopBar title="Edit night" back="Up next" />
      <window.Screen tabbar={false}>
        {/* which night */}
        <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 8, marginBottom: 4 }}>
          <div style={{ width: 46, height: 46, borderRadius: "var(--radius-md)", flex: "none", display: "grid", placeItems: "center", background: "var(--surface-spotlight)", boxShadow: "inset 0 0 0 1px var(--accent-glow)" }}>
            <i data-lucide="calendar" style={{ width: 22, height: 22, color: "var(--accent-strong)" }}></i>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)", whiteSpace: "nowrap" }}>{_KD.fmtWeekdayDate(s.date)}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent-strong)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 3 }}>{_KD.countdownLabel(s.date)} · {picker.name.split(" ")[0]} picks</div>
          </div>
        </div>

        <window.SectionLabel>Night settings</window.SectionLabel>
        <Group>
          <Row icon="calendar" label="Date" value={_KD.fmtDate(s.date, true)} trailing={<Chevron />} />
          <Row icon="repeat" label="Repeat" value={s.repeat.label} accentValue trailing={<Chevron />} />
          <Row icon="bell" label="Reminders" value="Day before, morning of" trailing={<Chevron />} last />
        </Group>

        <window.SectionLabel>Who's coming · {[...present].length}</window.SectionLabel>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {core.map((m, i) => {
            const here = present.has(m.id);
            return (
              <div key={m.id} onClick={() => toggle(m.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 8px", cursor: "pointer", borderBottom: i < core.length - 1 ? "1px solid var(--border-hairline)" : "none", opacity: here ? 1 : 0.5 }}>
                <KAvatar name={m.name} size="sm" />
                <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--text-primary)" }}>{m.name}</span>
                {here ? <KBadge tone="accent" solid>✓ In</KBadge> : <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Out</span>}
              </div>
            );
          })}
        </div>
      </window.Screen>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25, padding: "14px 20px 30px", background: "linear-gradient(transparent, var(--night-900) 26%)", display: "flex", flexDirection: "column", gap: 8 }}>
        <KButton fullWidth>Save changes</KButton>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <KButton variant="ghost" size="sm" style={{ color: "var(--text-danger)" }}>Cancel this night</KButton>
        </div>
      </div>
    </window.Phone>
  );
}

// ── 2. Repeat (recurrence) ─────────────────────────────────────
function RepeatScreen() {
  const s = _KD.scheduledNight;
  const [sel, setSel] = React.useState("weekly-1");
  const opts = [
    { id: "none", label: "Doesn't repeat", note: "A one-off night" },
    { id: "weekly-1", label: "Every week", note: `${_KD.weekday(s.date, true)}s` },
    { id: "weekly-2", label: "Every 2 weeks", note: `${_KD.weekday(s.date, true)}s` },
    { id: "monthly", label: "Every month", note: `Third ${_KD.weekday(s.date, true)}` },
  ];
  const interval = sel === "weekly-2" ? 2 : 1;
  const preview = sel === "none" ? [s.date] : _KD.upcomingDates(s.date, interval, 4);

  return (
    <window.Phone>
      <window.TopBar title="Repeat" back="Edit" />
      <window.Screen tabbar={false}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--text-secondary)", marginTop: 8, lineHeight: "var(--leading-normal)" }}>
          Keep movie night on a cadence. We'll roll the rotation forward each time, so the next picker is always ready.
        </div>

        <window.SectionLabel>How often</window.SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {opts.map((o) => {
            const on = sel === o.id;
            return (
              <div key={o.id} onClick={() => setSel(o.id)} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", borderRadius: "var(--radius-md)",
                background: on ? "var(--surface-spotlight)" : "var(--surface-card)",
                boxShadow: on ? "inset 0 0 0 1.5px var(--accent)" : "inset 0 0 0 1px var(--border-hairline)",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{o.label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>{o.note}</div>
                </div>
                <div style={{ width: 22, height: 22, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: on ? "var(--accent)" : "transparent", boxShadow: on ? "none" : "inset 0 0 0 1.5px var(--border-strong)" }}>
                  {on && <i data-lucide="check" style={{ width: 14, height: 14, color: "var(--text-on-accent)" }}></i>}
                </div>
              </div>
            );
          })}
        </div>

        <window.SectionLabel>Up next</window.SectionLabel>
        <Group>
          {preview.map((d, i) => (
            <div key={d} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < preview.length - 1 ? "1px solid var(--border-hairline)" : "none" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: i === 0 ? "var(--accent-strong)" : "var(--text-tertiary)", width: 18 }}>{i === 0 ? "✦" : i + 1}</span>
              <span style={{ flex: 1, fontFamily: "var(--font-display)", fontSize: 19, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)" }}>{_KD.fmtWeekdayDate(d)}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>{_KD.countdownLabel(d)}</span>
            </div>
          ))}
        </Group>
      </window.Screen>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25, padding: "14px 20px 30px", background: "linear-gradient(transparent, var(--night-900) 26%)" }}>
        <KButton fullWidth>Done</KButton>
      </div>
    </window.Phone>
  );
}

// ── 3. Reminders ───────────────────────────────────────────────
function RemindersScreen() {
  const r = _KD.scheduledNight.reminders;
  return (
    <window.Phone>
      <window.TopBar title="Reminders" back="Edit" />
      <window.Screen tabbar={false}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--text-secondary)", marginTop: 8, lineHeight: "var(--leading-normal)" }}>
          A gentle nudge so nobody forgets — and the picker comes with a film in mind.
        </div>

        <window.SectionLabel>When to remind</window.SectionLabel>
        <Group>
          <Row icon="moon" label="The night before" sub="6:00 PM" trailing={<Toggle on={r.dayBefore} />} />
          <Row icon="sunrise" label="Morning of" sub="9:00 AM" trailing={<Toggle on={r.morningOf} />} />
          <Row icon="clock" label="2 hours before" sub="Final heads-up" trailing={<Toggle on={r.hoursBefore} />} last />
        </Group>

        <window.SectionLabel>Who gets nudged</window.SectionLabel>
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { id: "all", label: "Everyone coming", note: "The whole group", on: r.audience === "all" },
            { id: "picker", label: "Just the picker", note: "Only whoever's up", on: r.audience === "picker" },
          ].map((o) => (
            <div key={o.id} style={{
              flex: 1, padding: "14px 14px", borderRadius: "var(--radius-md)", cursor: "pointer",
              background: o.on ? "var(--surface-spotlight)" : "var(--surface-card)",
              boxShadow: o.on ? "inset 0 0 0 1.5px var(--accent)" : "inset 0 0 0 1px var(--border-hairline)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{o.label}</span>
                {o.on && <i data-lucide="check" style={{ width: 16, height: 16, color: "var(--accent-strong)" }}></i>}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", marginTop: 8 }}>{o.note}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", background: "var(--surface-subtle)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-hairline)" }}>
          <i data-lucide="bell-ring" style={{ width: 17, height: 17, color: "var(--accent-strong)", flex: "none", marginTop: 1 }}></i>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--text-secondary)", lineHeight: "var(--leading-normal)" }}>
            The next-up member always gets a personal “it's your turn” nudge, even if reminders are off for everyone else.
          </span>
        </div>
      </window.Screen>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25, padding: "14px 20px 30px", background: "linear-gradient(transparent, var(--night-900) 26%)" }}>
        <KButton fullWidth>Done</KButton>
      </div>
    </window.Phone>
  );
}

// ── 4. How a reminder appears (lock screen) ────────────────────
function NotifCard({ time, title, body, ember }) {
  return (
    <div style={{
      display: "flex", gap: 11, padding: "12px 13px", borderRadius: 20, alignItems: "flex-start",
      background: "rgba(32,28,61,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      boxShadow: ember ? "inset 0 0 0 1px var(--accent-glow)" : "inset 0 0 0 1px rgba(228,224,247,0.10)",
    }}>
      <div style={{ width: 38, height: 38, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", background: "var(--night-950)", boxShadow: "0 0 14px rgba(246,139,54,0.3)" }}>
        <img src="../../assets/logomark.svg" alt="" style={{ width: 26, height: 26 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--haze-300)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Movie Night</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--haze-400)" }}>{time}</span>
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginTop: 4, lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--haze-300)", marginTop: 2, lineHeight: 1.35 }}>{body}</div>
      </div>
    </div>
  );
}

function NotificationsScreen() {
  return (
    <window.Phone>
      <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "radial-gradient(90% 50% at 50% 0%, rgba(246,139,54,0.18), transparent 55%), linear-gradient(180deg, var(--night-900), var(--night-950))" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 12, display: "flex", flexDirection: "column", padding: "0 16px" }}>
        {/* clock */}
        <div style={{ textAlign: "center", marginTop: 78 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--haze-300)", letterSpacing: "0.04em" }}>Thursday, June 18</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 76, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1, marginTop: 6, letterSpacing: "-0.02em" }}>9:41</div>
        </div>

        {/* notification stack */}
        <div style={{ marginTop: "auto", marginBottom: 30, display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--haze-400)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 6px 2px" }}>Notification Center</div>
          <NotifCard ember time="now" title="✦ It's your turn — you pick Friday's movie" body="Friday Film Club · Jun 19. Come with a film in mind." />
          <NotifCard time="9m ago" title="Movie night is on for this Friday" body="Tomas picks · 4 going. Tap to RSVP." />
          <NotifCard time="Wed" title="Reminder set" body="We'll nudge everyone the night before and the morning of." />
        </div>
      </div>
    </window.Phone>
  );
}

Object.assign(window, { EditNightScreen, RepeatScreen, RemindersScreen, NotificationsScreen });

// ── 5. Add to calendar (export sheet) ──────────────────────────
// A bottom-sheet over the Scheduled screen — choose a calendar, decide whether
// to add the whole recurring series, then it lands in the OS calendar.
function CalendarExportScreen() {
  const s = _KD.scheduledNight;
  const picker = _KD.byId(s.pickerId);
  const recurring = s.repeat && s.repeat.freq !== "none";
  const [cal, setCal] = React.useState("personal");
  const [series, setSeries] = React.useState(true);
  const cals = [
    { id: "personal", label: "Personal", sub: "iCloud", dot: "var(--moon-400)" },
    { id: "google",   label: "Google",   sub: "film.club@gmail.com", dot: "var(--green-500)" },
    { id: "work",     label: "Work",     sub: "Exchange", dot: "var(--ember-400)" },
  ];

  return (
    <window.Phone>
      {/* dimmed Scheduled context behind the sheet */}
      <div style={{ position: "absolute", inset: 0, zIndex: 8, background: "var(--surface-dark)" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 9, background: "radial-gradient(80% 40% at 50% 0%, rgba(246,139,54,0.14), transparent 60%)" }} />
      <div style={{ position: "absolute", top: 92, left: 0, right: 0, zIndex: 10, textAlign: "center", opacity: 0.5 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)" }}>Scheduled ✓</div>
      </div>
      <div style={{ position: "absolute", inset: 0, zIndex: 14, background: "rgba(7,6,15,0.55)" }} />

      {/* sheet */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20,
        background: "var(--night-900)", borderTopLeftRadius: "var(--radius-xl)", borderTopRightRadius: "var(--radius-xl)",
        boxShadow: "0 -20px 50px rgba(0,0,0,0.5)", border: "1px solid var(--border-hairline)",
        padding: "12px 20px 30px", maxHeight: "84%", display: "flex", flexDirection: "column",
      }}>
        <div style={{ width: 38, height: 5, borderRadius: 999, background: "var(--border-strong)", margin: "0 auto 16px" }} />
        <div style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)" }}>Add to calendar</div>

        {/* event preview */}
        <div style={{ display: "flex", gap: 13, marginTop: 16, padding: "14px", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-lg)" }}>
          <div style={{ width: 46, height: 46, borderRadius: "var(--radius-md)", flex: "none", overflow: "hidden", textAlign: "center", background: "var(--night-950)", boxShadow: "inset 0 0 0 1px var(--border-hairline)" }}>
            <div style={{ background: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-on-accent)", padding: "2px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>{_KD.weekday(s.date)}</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 20, fontWeight: 700, color: "var(--text-primary)", lineHeight: "26px" }}>{s.date.split("-")[2]}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>🎬 Movie Night — {picker.name.split(" ")[0]} picks</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", marginTop: 5, lineHeight: 1.5 }}>{_KD.fmtWeekdayDate(s.date)} · 7:30 PM{recurring ? `\u2003↻ ${s.repeat.label}` : ""}</div>
          </div>
        </div>

        <window.SectionLabel style={{ marginTop: 18 }}>Add to</window.SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cals.map((c) => {
            const on = cal === c.id;
            return (
              <div key={c.id} onClick={() => setCal(c.id)} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", borderRadius: "var(--radius-md)",
                background: on ? "var(--surface-spotlight)" : "var(--surface-card)",
                boxShadow: on ? "inset 0 0 0 1.5px var(--accent)" : "inset 0 0 0 1px var(--border-hairline)",
              }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: c.dot, flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{c.label} </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>{c.sub}</span>
                </div>
                <div style={{ width: 20, height: 20, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: on ? "var(--accent)" : "transparent", boxShadow: on ? "none" : "inset 0 0 0 1.5px var(--border-strong)" }}>
                  {on && <i data-lucide="check" style={{ width: 13, height: 13, color: "var(--text-on-accent)" }}></i>}
                </div>
              </div>
            );
          })}
        </div>

        {recurring && (
          <div onClick={() => setSeries((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 14, padding: "13px 14px", cursor: "pointer", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-md)" }}>
            <i data-lucide="repeat" style={{ width: 19, height: 19, color: "var(--accent-strong)", flex: "none" }}></i>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--text-primary)" }}>Add the whole series</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", marginTop: 3 }}>{series ? s.repeat.label + ", recurring" : "Just this one night"}</div>
            </div>
            <Toggle on={series} />
          </div>
        )}
      </div>

      {/* sheet CTA */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 21, padding: "14px 20px 30px", background: "linear-gradient(transparent, var(--night-900) 30%)", display: "flex", flexDirection: "column", gap: 8 }}>
        <KButton fullWidth>Add event{recurring && series ? "s" : ""}</KButton>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <KButton variant="ghost" size="sm" style={{ color: "var(--text-secondary)" }}>Not now</KButton>
        </div>
      </div>
    </window.Phone>
  );
}

// ── 6. Added to calendar (confirmation) ────────────────────────
function CalendarAddedScreen() {
  const s = _KD.scheduledNight;
  const dates = _KD.upcomingDates(s.date, s.repeat.intervalWeeks, 3);
  return (
    <window.Phone glow>
      <window.TopBar title="" back="Done" />
      <window.Screen tabbar={false}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginTop: 24 }}>
          <div style={{ position: "relative", width: 86, height: 86 }}>
            <div style={{ position: "absolute", inset: -6, borderRadius: "50%", background: "radial-gradient(circle, var(--accent-glow), transparent 70%)" }} />
            <div style={{ position: "relative", width: 86, height: 86, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--accent)", boxShadow: "0 8px 28px rgba(246,139,54,0.45)" }}>
              <i data-lucide="calendar-check" style={{ width: 40, height: 40, color: "var(--text-on-accent)" }}></i>
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 32, lineHeight: 1.08, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)", marginTop: 22 }}>On the calendar</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--text-secondary)", marginTop: 8, lineHeight: "var(--leading-normal)", maxWidth: 260 }}>
            Added to <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Personal</span>, recurring {s.repeat.label.toLowerCase()}. Everyone you invite gets it too.
          </div>
        </div>

        <window.SectionLabel>Next on your calendar</window.SectionLabel>
        <Group>
          {dates.map((d, i) => (
            <div key={d} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < dates.length - 1 ? "1px solid var(--border-hairline)" : "none" }}>
              <i data-lucide="calendar" style={{ width: 16, height: 16, color: i === 0 ? "var(--accent-strong)" : "var(--text-tertiary)" }}></i>
              <span style={{ flex: 1, fontFamily: "var(--font-display)", fontSize: 19, color: "var(--text-primary)", letterSpacing: "var(--tracking-display)" }}>{_KD.fmtWeekdayDate(d)}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>7:30 PM</span>
            </div>
          ))}
        </Group>
      </window.Screen>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25, padding: "14px 20px 30px", background: "linear-gradient(transparent, var(--night-900) 26%)", display: "flex", flexDirection: "column", gap: 8 }}>
        <KButton fullWidth>Open calendar</KButton>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <KButton variant="ghost" size="sm" style={{ color: "var(--text-secondary)" }}>Back to Movie Night</KButton>
        </div>
      </div>
    </window.Phone>
  );
}

Object.assign(window, { CalendarExportScreen, CalendarAddedScreen });
