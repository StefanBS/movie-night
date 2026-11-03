// Movie Night — Upcoming (tab 2): every night on the calendar, next first.
// The scheduled night shows its picker; later dates in a repeating series show
// whose turn it will be if the rotation holds, in quieter type. The one action
// is "Plan a night" (the only entry to the new-night flow besides Tonight).

const _up_DS = window.MovieNightDesignSystem_b54ad3;
const { Button: UButton, Avatar: UAvatar } = _up_DS;
const _UD = window.MNData;

function DateBlock({ iso, strong }) {
  return (
    <div style={{ width: 48, flex: "none", textAlign: "center", padding: "6px 0", borderRadius: "var(--radius-md)", background: strong ? "var(--surface-card)" : "transparent", boxShadow: strong ? "none" : "inset 0 0 0 1px var(--border-hairline)" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>{_UD.weekday(iso)}</div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{+iso.split("-")[2]}</div>
    </div>
  );
}

function UpcomingRow({ iso, title, meta, avatar, strong, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: last ? "none" : "1px solid var(--border-hairline)", cursor: "pointer" }}>
      <DateBlock iso={iso} strong={strong} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: strong ? 700 : 500, color: strong ? "var(--text-primary)" : "var(--text-secondary)" }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-tertiary)", marginTop: 3 }}>{meta}</div>
      </div>
      {avatar && <UAvatar name={avatar} size={28} style={{ opacity: strong ? 1 : 0.6 }} />}
      <i data-lucide="chevron-right" style={{ width: 18, height: 18, color: "var(--text-tertiary)" }}></i>
    </div>
  );
}

function UpcomingScreen() {
  const s = _UD.scheduledNight;
  const order = _UD.turnOrder();
  const dates = _UD.upcomingDates(s.date, s.repeat.intervalWeeks, 4);
  const picker = _UD.byId(s.pickerId);
  // Projected pickers for the rest of the series: the rotation after this night's picker.
  const rest = order.filter((m) => m.id !== s.pickerId);
  return (
    <window.Phone>
      <window.TopBar kind="tab" title="Upcoming" group={`${s.repeat.label} · next ${_UD.countdownLabel(s.date)}.`} />
      <window.Screen>
        <window.SectionLabel style={{ marginTop: 24 }}>Next</window.SectionLabel>
        <UpcomingRow iso={dates[0]} strong avatar={picker.name}
          title={_UD.fmtWeekdayDate(dates[0]) + " · 8 pm"}
          meta={<><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flex: "none" }}></span>{picker.name.split(" ")[0]} picks · {s.presentIds.length} coming</>}
          last />
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 28 }}>
          <window.SectionLabel style={{ margin: 0 }}>{s.repeat.label}</window.SectionLabel>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", cursor: "pointer" }}>Edit repeat</span>
        </div>
        <div style={{ marginTop: 8 }}>
          {dates.slice(1).map((d, i) => (
            <UpcomingRow key={d} iso={d} avatar={rest[i] && rest[i].name}
              title={_UD.fmtWeekdayDate(d)}
              meta={rest[i] ? `${rest[i].name.split(" ")[0]}'s turn, if the order holds` : "Picker set nearer the date"}
              last={i === dates.length - 2} />
          ))}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-tertiary)", lineHeight: 1.5, marginTop: 14 }}>The order can change if someone skips or misses a night. Each picker is confirmed when their night is next.</div>
        <div style={{ marginTop: 22 }}><UButton>Plan a night</UButton></div>
      </window.Screen>
      <window.TabBar active="upcoming" />
    </window.Phone>
  );
}

// Nothing on the calendar yet: one honest line and the one action.
function UpcomingEmptyScreen() {
  const next = _UD.turnOrder()[0];
  return (
    <window.Phone>
      <window.TopBar kind="tab" title="Upcoming" group="Nothing planned yet." />
      <window.Screen>
        <div style={{ marginTop: 64, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
          <span style={{ width: 56, height: 56, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--surface-subtle)", color: "var(--text-secondary)" }}><i data-lucide="calendar-days" style={{ width: 26, height: 26 }}></i></span>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.15 }}>No nights on the calendar.</div>
          <div style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.5, maxWidth: 300 }}>{`Plan one and ${next.name.split(" ")[0]} picks the film. Set it to repeat and the rotation keeps going on its own.`}</div>
          <UButton style={{ marginTop: 6 }}>Plan a night</UButton>
        </div>
      </window.Screen>
      <window.TabBar active="upcoming" />
    </window.Phone>
  );
}

Object.assign(window, { UpcomingScreen, UpcomingEmptyScreen });
