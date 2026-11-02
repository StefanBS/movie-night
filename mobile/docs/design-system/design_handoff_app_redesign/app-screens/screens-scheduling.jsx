// Movie Night — scheduling follow-ons: Edit night, Repeat, Reminders, the nudge
// (lock screen), Add to calendar, On the calendar.

const _sch_DS = window.MovieNightDesignSystem_b54ad3;
const { Avatar: KAvatar, Badge: KBadge, Button: KButton, Toggle: KToggle } = _sch_DS;
const _KD = window.MNData;

function Toggle({ on }) {
  const [v, setV] = React.useState(on);
  return <KToggle value={v} onChange={setV} label="Toggle" />;
}
function Group({ children, style }) {
  return <div style={{ background: "var(--surface-card)", borderRadius: "var(--radius-lg)", overflow: "hidden", ...style }}>{children}</div>;
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
const Chevron = () => <i data-lucide="chevron-right" style={{ width: 18, height: 18, color: "var(--text-tertiary)" }}></i>;
const Radio = ({ on }) => (
  <span style={{ width: 22, height: 22, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: on ? "var(--text-primary)" : "transparent", boxShadow: on ? "none" : "inset 0 0 0 1.5px var(--border-strong)", color: "var(--surface-page)" }}>
    {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
  </span>
);
const Option = ({ on, onClick, label, note, style }) => (
  <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", boxShadow: on ? "inset 0 0 0 2px var(--text-primary)" : "none", ...style }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{label}</div>
      {note && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{note}</div>}
    </div>
    <Radio on={on} />
  </div>
);
const Intro = ({ children }) => <div style={{ fontSize: 15, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.45 }}>{children}</div>;

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
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 32, lineHeight: 1, letterSpacing: "-0.04em" }}>{_KD.fmtWeekdayDate(s.date)}</div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 8 }}>{_KD.countdownLabel(s.date)} · <b style={{ color: "var(--text-primary)" }}>{picker.name.split(" ")[0]}</b> picks</div>
        </div>
        <window.SectionLabel style={{ marginTop: 26 }}>Night settings</window.SectionLabel>
        <Group>
          <Row icon="calendar" label="Date" value={_KD.fmtDate(s.date, true)} trailing={<Chevron />} />
          <Row icon="repeat" label="Repeat" value={s.repeat.label} trailing={<Chevron />} />
          <Row icon="bell" label="Reminders" value="Day before, morning" trailing={<Chevron />} last />
        </Group>
        <window.SectionLabel style={{ marginTop: 26 }}>Who's coming · {present.size}</window.SectionLabel>
        {core.map((m, i) => {
          const here = present.has(m.id);
          return (
            <div key={m.id} onClick={() => toggle(m.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", cursor: "pointer", borderBottom: i < core.length - 1 ? "1px solid var(--border-hairline)" : "none" }}>
              <div style={{ opacity: here ? 1 : 0.4 }}><KAvatar name={m.name} size="sm" /></div>
              <span style={{ flex: 1, fontSize: 16, fontWeight: 500, opacity: here ? 1 : 0.5 }}>{m.name}</span>
              <Radio on={here} />
            </div>
          );
        })}
      </window.Screen>
      <window.Footer>
        <KButton fullWidth>Save changes</KButton>
        <div style={{ display: "flex", justifyContent: "center" }}><KButton variant="danger" size="sm">Cancel this night</KButton></div>
      </window.Footer>
    </window.Phone>
  );
}

// ── 2. Repeat ──────────────────────────────────────────────────
function RepeatScreen() {
  const s = _KD.scheduledNight;
  const [sel, setSel] = React.useState("weekly-1");
  const wd = _KD.weekday(s.date, true);
  const opts = [
    { id: "none", label: "Doesn't repeat", note: "A one-off night" },
    { id: "weekly-1", label: "Every week", note: wd + "s" },
    { id: "weekly-2", label: "Every 2 weeks", note: wd + "s" },
    { id: "monthly", label: "Every month", note: "Third " + wd },
  ];
  const preview = sel === "none" ? [s.date] : _KD.upcomingDates(s.date, sel === "weekly-2" ? 2 : 1, 4);
  return (
    <window.Phone>
      <window.TopBar title="Repeat" back="Edit" />
      <window.Screen tabbar={false}>
        <Intro>Keep movie night on a cadence. The rotation rolls forward each time, so the next picker is always ready.</Intro>
        <window.SectionLabel style={{ marginTop: 24 }}>How often</window.SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {opts.map((o) => <Option key={o.id} on={sel === o.id} onClick={() => setSel(o.id)} label={o.label} note={o.note} />)}
        </div>
        <window.SectionLabel style={{ marginTop: 26 }}>Up next</window.SectionLabel>
        {preview.map((d, i) => (
          <div key={d} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "11px 0", borderBottom: i < preview.length - 1 ? "1px solid var(--border-hairline)" : "none" }}>
            <span style={{ flex: 1, fontSize: 17, fontWeight: i === 0 ? 800 : 500, letterSpacing: i === 0 ? "-0.02em" : 0 }}>{_KD.fmtWeekdayDate(d)}</span>
            <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{_KD.countdownLabel(d)}</span>
          </div>
        ))}
      </window.Screen>
      <window.Footer><KButton fullWidth>Done</KButton></window.Footer>
    </window.Phone>
  );
}

// ── 3. Reminders ───────────────────────────────────────────────
function RemindersScreen() {
  const r = _KD.scheduledNight.reminders;
  const [aud, setAud] = React.useState(r.audience);
  return (
    <window.Phone>
      <window.TopBar title="Reminders" back="Edit" />
      <window.Screen tabbar={false}>
        <Intro>A gentle nudge so nobody forgets, and the picker comes with a film in mind.</Intro>
        <window.SectionLabel style={{ marginTop: 24 }}>When to remind</window.SectionLabel>
        <Group>
          <Row icon="moon" label="The night before" sub="6:00 pm" trailing={<Toggle on={r.dayBefore} />} />
          <Row icon="sunrise" label="Morning of" sub="9:00 am" trailing={<Toggle on={r.morningOf} />} />
          <Row icon="clock" label="2 hours before" sub="Final heads-up" trailing={<Toggle on={r.hoursBefore} />} last />
        </Group>
        <window.SectionLabel style={{ marginTop: 26 }}>Who gets nudged</window.SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Option on={aud === "all"} onClick={() => setAud("all")} label="Everyone coming" note="The whole group" />
          <Option on={aud === "picker"} onClick={() => setAud("picker")} label="Just the picker" note="Only whoever's up" />
        </div>
        <_sch_DS.Banner style={{ marginTop: 18 }}>The next-up member always gets a personal “it's your turn” nudge, even if reminders are off for everyone else.</_sch_DS.Banner>
      </window.Screen>
      <window.Footer><KButton fullWidth>Done</KButton></window.Footer>
    </window.Phone>
  );
}

// ── 4. The nudge (lock screen — always the OS's dark look) ─────
function NotifCard({ time, title, body }) {
  return (
    <div style={{ display: "flex", gap: 11, padding: "12px 13px", borderRadius: 20, alignItems: "flex-start", background: "rgba(42,40,36,0.78)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
      <div style={{ width: 38, height: 38, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", background: "#11100E" }}>
        <img src="../../assets/logomark.svg" alt="" style={{ width: 24, height: 24 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ fontWeight: 700, color: "#B5AEA3" }}>Movie Night</span>
          <span style={{ color: "#857F76" }}>{time}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#EDE8E0", marginTop: 4, lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: 13, color: "#B5AEA3", marginTop: 2, lineHeight: 1.35 }}>{body}</div>
      </div>
    </div>
  );
}
function NotificationsScreen() {
  return (
    <window.Phone>
      <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "linear-gradient(180deg, #3B3833, #11100E 70%)" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 31, display: "flex", flexDirection: "column", padding: "0 16px", color: "#EDE8E0" }}>
        <div style={{ textAlign: "center", marginTop: 80 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: "#D6D0C6" }}>Thursday, June 18</div>
          <div style={{ fontSize: 80, fontWeight: 700, lineHeight: 1, marginTop: 4, letterSpacing: "-0.04em" }}>9:41</div>
        </div>
        <div style={{ marginTop: "auto", marginBottom: 34, display: "flex", flexDirection: "column", gap: 9 }}>
          <NotifCard time="now" title="It's your turn: you pick Friday's film" body="Friday Film Club · Jun 19. Come with a film in mind." />
          <NotifCard time="9m ago" title="Movie night is on for this Friday" body="Tomas picks · 4 going. Tap to RSVP." />
          <NotifCard time="Wed" title="Reminder set" body="We'll nudge everyone the night before and the morning of." />
        </div>
      </div>
    </window.Phone>
  );
}

// ── 5. Add to calendar (sheet) ─────────────────────────────────
function CalendarExportScreen() {
  const s = _KD.scheduledNight;
  const picker = _KD.byId(s.pickerId);
  const recurring = s.repeat && s.repeat.freq !== "none";
  const [cal, setCal] = React.useState("personal");
  const [series, setSeries] = React.useState(true);
  const cals = [
    { id: "personal", label: "Personal", sub: "iCloud", dot: "var(--sig-6)" },
    { id: "google", label: "Google", sub: "film.club@gmail.com", dot: "var(--sig-4)" },
    { id: "work", label: "Work", sub: "Exchange", dot: "var(--sig-7)" },
  ];
  return (
    <window.Phone>
      <div style={{ position: "absolute", top: 110, left: 24, zIndex: 8, opacity: 0.5 }}>
        <div style={{ fontWeight: 800, fontSize: 56, letterSpacing: "-0.05em", lineHeight: 0.92 }}>Friday</div>
      </div>
      <div style={{ position: "absolute", inset: 0, zIndex: 14, background: "rgba(10,9,8,0.5)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20, background: "var(--surface-page)", borderTopLeftRadius: "var(--radius-xl)", borderTopRightRadius: "var(--radius-xl)", boxShadow: "var(--shadow-lg)", padding: "12px 20px 150px" }}>
        <div style={{ width: 38, height: 5, borderRadius: 999, background: "var(--border-strong)", margin: "0 auto 18px" }} />
        <div style={{ fontWeight: 800, fontSize: 28, letterSpacing: "-0.035em" }}>Add to calendar</div>
        <div style={{ display: "flex", gap: 13, marginTop: 16, padding: 14, background: "var(--surface-card)", borderRadius: "var(--radius-lg)" }}>
          <div style={{ width: 46, height: 48, borderRadius: "var(--radius-md)", flex: "none", overflow: "hidden", textAlign: "center", background: "var(--surface-subtle)" }}>
            <div style={{ background: "var(--accent)", fontSize: 10, fontWeight: 700, color: "var(--text-on-accent)", padding: "3px 0" }}>{_KD.weekday(s.date)}</div>
            <div style={{ fontSize: 20, fontWeight: 800, lineHeight: "28px" }}>{+s.date.split("-")[2]}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Movie Night: {picker.name.split(" ")[0]} picks</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.45 }}>{_KD.fmtWeekdayDate(s.date)} · 7:30 pm{recurring ? " · " + s.repeat.label : ""}</div>
          </div>
        </div>
        <window.SectionLabel style={{ marginTop: 20 }}>Add to</window.SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cals.map((c) => (
            <div key={c.id} onClick={() => setCal(c.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", boxShadow: cal === c.id ? "inset 0 0 0 2px var(--text-primary)" : "none" }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: c.dot, flex: "none" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{c.sub}</div>
              </div>
              <Radio on={cal === c.id} />
            </div>
          ))}
        </div>
        {recurring && (
          <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 12, padding: "13px 14px", background: "var(--surface-card)", borderRadius: "var(--radius-lg)" }}>
            <i data-lucide="repeat" style={{ width: 19, height: 19, color: "var(--text-secondary)", flex: "none" }}></i>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Add the whole series</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{series ? s.repeat.label + ", recurring" : "Just this one night"}</div>
            </div>
            <KToggle value={series} onChange={setSeries} label="Whole series" />
          </div>
        )}
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 21, padding: "14px 20px 32px", display: "flex", flexDirection: "column", gap: 6 }}>
        <KButton fullWidth>{recurring && series ? "Add events" : "Add event"}</KButton>
        <div style={{ display: "flex", justifyContent: "center" }}><KButton variant="ghost" size="sm">Not now</KButton></div>
      </div>
    </window.Phone>
  );
}

// ── 6. On the calendar (confirmation) ──────────────────────────
function CalendarAddedScreen() {
  const s = _KD.scheduledNight;
  const dates = _KD.upcomingDates(s.date, s.repeat.intervalWeeks, 3);
  return (
    <window.Phone>
      <window.TopBar title="" back="Done" />
      <window.Screen tabbar={false}>
        <div style={{ marginTop: 30 }}>
          <span style={{ width: 56, height: 56, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--surface-subtle)" }}>
            <i data-lucide="calendar-check" style={{ width: 26, height: 26, color: "var(--text-primary)" }}></i>
          </span>
          <div style={{ fontWeight: 800, fontSize: 40, lineHeight: 0.98, letterSpacing: "-0.045em", marginTop: 20 }}>On the calendar.</div>
          <Intro>Added to <b style={{ color: "var(--text-primary)" }}>Personal</b>, recurring {s.repeat.label.toLowerCase()}. Everyone you invite gets it too.</Intro>
        </div>
        <window.SectionLabel style={{ marginTop: 28 }}>Next on your calendar</window.SectionLabel>
        {dates.map((d, i) => (
          <div key={d} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "11px 0", borderBottom: i < dates.length - 1 ? "1px solid var(--border-hairline)" : "none" }}>
            <span style={{ flex: 1, fontSize: 17, fontWeight: i === 0 ? 800 : 500, letterSpacing: i === 0 ? "-0.02em" : 0 }}>{_KD.fmtWeekdayDate(d)}</span>
            <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>7:30 pm</span>
          </div>
        ))}
      </window.Screen>
      <window.Footer>
        <KButton fullWidth>Open calendar</KButton>
        <div style={{ display: "flex", justifyContent: "center" }}><KButton variant="ghost" size="sm">Back to Movie Night</KButton></div>
      </window.Footer>
    </window.Phone>
  );
}

Object.assign(window, { EditNightScreen, RepeatScreen, RemindersScreen, NotificationsScreen, CalendarExportScreen, CalendarAddedScreen });
