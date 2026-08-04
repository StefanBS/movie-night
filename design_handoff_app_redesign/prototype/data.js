// Movie Night — extended seed data for the proposed app screens.
// Builds on the same demo group ("Friday Film Club") used by the original kit,
// and adds the night HISTORY + a movie pool — the data the redesigned app needs
// but the original three screens never modelled.

window.MNData = (function () {
  const TODAY = "2026-06-15";
  // ── Members ────────────────────────────────────────────────
  const members = [
    { id: "m-tomas",  name: "Tomas Vlk",      role: "core",  status: "active",   servedCount: 0, lastPickedOn: null,         joinedOn: "2025-09-12" },
    { id: "m-priya",  name: "Priya Nair",     role: "core",  status: "active",   servedCount: 2, lastPickedOn: "2026-05-02", joinedOn: "2025-09-12" },
    { id: "m-dana",   name: "Dana Whitfield", role: "core",  status: "active",   servedCount: 2, lastPickedOn: "2026-05-16", joinedOn: "2025-09-12" },
    { id: "m-sam",    name: "Sam Okafor",     role: "core",  status: "active",   servedCount: 3, lastPickedOn: "2026-05-23", joinedOn: "2025-10-03" },
    { id: "m-marcus", name: "Marcus Lee",     role: "core",  status: "active",   servedCount: 3, lastPickedOn: "2026-05-30", joinedOn: "2025-10-03" },
    { id: "m-jess",   name: "Jess Romano",    role: "guest", status: "active",   servedCount: 0, lastPickedOn: null,         joinedOn: "2026-04-30" },
    { id: "m-erin",   name: "Erin Park",      role: "core",  status: "inactive", servedCount: 1, lastPickedOn: "2026-03-14", joinedOn: "2025-09-12" },
  ];

  const byId = (id) => members.find((m) => m.id === id);

  // ── Movie pool (poster hue is used to render an offline poster tile) ──
  const movies = {
    "past-lives":   { title: "Past Lives",                        year: 2023, hue: 18,  runtime: "1h 46m" },
    "aftersun":     { title: "Aftersun",                          year: 2022, hue: 32,  runtime: "1h 42m" },
    "worst-person": { title: "The Worst Person in the World",     year: 2021, hue: 348, runtime: "2h 08m" },
    "portrait":     { title: "Portrait of a Lady on Fire",        year: 2019, hue: 8,   runtime: "2h 02m" },
    "drive-my-car": { title: "Drive My Car",                      year: 2021, hue: 0,   runtime: "2h 59m" },
    "eeaao":        { title: "Everything Everywhere All at Once", year: 2022, hue: 286, runtime: "2h 19m" },
    "banshees":     { title: "The Banshees of Inisherin",         year: 2022, hue: 158, runtime: "1h 54m" },
    "anatomy":      { title: "Anatomy of a Fall",                 year: 2023, hue: 224, runtime: "2h 31m" },
    "tar":          { title: "Tár",                               year: 2022, hue: 210, runtime: "2h 38m" },
    "petite":       { title: "Petite Maman",                      year: 2021, hue: 130, runtime: "1h 12m" },
    "zone":         { title: "The Zone of Interest",              year: 2023, hue: 96,  runtime: "1h 45m" },
    "perfect-days": { title: "Perfect Days",                      year: 2023, hue: 44,  runtime: "2h 04m" },
    "fallen":       { title: "Fallen Leaves",                     year: 2023, hue: 4,   runtime: "1h 21m" },
    "strangers":    { title: "All of Us Strangers",               year: 2023, hue: 264, runtime: "1h 45m" },
  };

  // ── Night history (most recent first) ──────────────────────
  // Picker counts here add up to each member's servedCount above.
  const nights = [
    { id: "n-30", date: "2026-05-30", movie: "aftersun",     pickerId: "m-marcus", presentIds: ["m-tomas","m-priya","m-dana","m-sam","m-marcus"], reaction: "loved" },
    { id: "n-23", date: "2026-05-23", movie: "worst-person", pickerId: "m-sam",    presentIds: ["m-priya","m-dana","m-sam","m-marcus","m-jess"], reaction: "loved" },
    { id: "n-16", date: "2026-05-16", movie: "portrait",     pickerId: "m-dana",   presentIds: ["m-tomas","m-dana","m-sam","m-marcus"], reaction: "loved" },
    { id: "n-09", date: "2026-05-09", movie: "drive-my-car", pickerId: "m-marcus", presentIds: ["m-priya","m-dana","m-sam","m-marcus"], reaction: "liked" },
    { id: "n-02", date: "2026-05-02", movie: "past-lives",   pickerId: "m-priya",  presentIds: ["m-tomas","m-priya","m-dana","m-sam","m-marcus"], reaction: "loved" },
    { id: "n-425",date: "2026-04-25", movie: "eeaao",        pickerId: "m-sam",    presentIds: ["m-priya","m-sam","m-marcus","m-jess"], reaction: "liked" },
    { id: "n-418",date: "2026-04-18", movie: "banshees",     pickerId: "m-dana",   presentIds: ["m-tomas","m-priya","m-dana","m-sam"], reaction: "liked" },
    { id: "n-411",date: "2026-04-11", movie: "anatomy",      pickerId: "m-priya",  presentIds: ["m-priya","m-dana","m-sam","m-marcus"], reaction: "loved" },
    { id: "n-404",date: "2026-04-04", movie: "tar",          pickerId: "m-sam",    presentIds: ["m-tomas","m-priya","m-sam"], reaction: "okay" },
    { id: "n-328",date: "2026-03-28", movie: "zone",         pickerId: "m-marcus", presentIds: ["m-priya","m-dana","m-sam","m-marcus"], reaction: "liked" },
    { id: "n-314",date: "2026-03-14", movie: "petite",       pickerId: "m-erin",   presentIds: ["m-priya","m-dana","m-erin"], reaction: "loved" },
  ];

  // ── Turn order: active core only, least served first, then oldest pick ──
  function turnOrder(ms = members) {
    return ms
      .filter((m) => m.role === "core" && m.status === "active")
      .slice()
      .sort((a, b) => {
        if (a.servedCount !== b.servedCount) return a.servedCount - b.servedCount;
        const al = a.lastPickedOn ?? "0000-00-00";
        const bl = b.lastPickedOn ?? "0000-00-00";
        return al.localeCompare(bl);
      });
  }

  // Picks (history nights) for one member, newest first.
  function picksFor(id) {
    return nights.filter((n) => n.pickerId === id);
  }

  function picksLabel(n) {
    return `${n} pick${n === 1 ? "" : "s"}`;
  }

  // "2026-05-30" → "May 30" ; full=true → "May 30, 2026"
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtDate(iso, full = false) {
    if (!iso) return "never";
    const [y, m, d] = iso.split("-").map(Number);
    return `${MONTHS[m - 1]} ${d}${full ? ", " + y : ""}`;
  }
  function monthLabel(iso) {
    const [y, m] = iso.split("-").map(Number);
    return `${["January","February","March","April","May","June","July","August","September","October","November","December"][m - 1]} ${y}`;
  }

  // ── Date / scheduling helpers ──────────────────────────────
  const WD_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const WD_LONG  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  function _d(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
  function weekday(iso, long = false) { return (long ? WD_LONG : WD_SHORT)[_d(iso).getDay()]; }
  function daysUntil(iso) { return Math.round((_d(iso) - _d(TODAY)) / 86400000); }
  // "Friday, Jun 19"
  function fmtWeekdayDate(iso) { return `${weekday(iso, true)}, ${fmtDate(iso)}`; }
  // Human relative label: Tonight / Tomorrow / This Friday / in 9 days / past date
  function relativeLabel(iso) {
    const n = daysUntil(iso);
    if (n === 0) return "Tonight";
    if (n === 1) return "Tomorrow";
    if (n > 1 && n < 7) return `This ${weekday(iso, true)}`;
    if (n >= 7 && n < 14) return `Next ${weekday(iso, true)}`;
    return fmtWeekdayDate(iso);
  }
  function countdownLabel(iso) {
    const n = daysUntil(iso);
    if (n === 0) return "tonight";
    if (n === 1) return "tomorrow";
    if (n > 0) return `in ${n} days`;
    return `${-n} days ago`;
  }
  const _pad = (n) => String(n).padStart(2, "0");
  const _iso = (dt) => `${dt.getFullYear()}-${_pad(dt.getMonth() + 1)}-${_pad(dt.getDate())}`;
  // Next `count` occurrences of a weekly recurrence, starting at/after today.
  function upcomingDates(startIso, intervalWeeks, count) {
    const out = [];
    let dt = _d(startIso), today = _d(TODAY);
    while (dt < today) dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 7 * intervalWeeks);
    for (let i = 0; i < count; i++) {
      out.push(_iso(dt));
      dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 7 * intervalWeeks);
    }
    return out;
  }

  // A night planned for the future — the picker is set by the rotation, the
  // movie is chosen on the night itself. Optionally repeats, with reminders.
  const scheduledNight = {
    date: "2026-06-19",
    pickerId: "m-tomas",
    presentIds: ["m-tomas", "m-priya", "m-dana", "m-marcus"],
    movie: null,
    repeat: { freq: "weekly", intervalWeeks: 1, weekday: 5, label: "Every Friday" },
    reminders: { dayBefore: true, morningOf: true, hoursBefore: false, audience: "all" },
  };
  // Dates that already have (or will have) a night — for calendar dots.
  const nightDates = new Set([...nights.map((n) => n.date), scheduledNight.date]);

  return {
    members, byId, movies, nights, turnOrder, picksFor, picksLabel,
    fmtDate, monthLabel, weekday, daysUntil, fmtWeekdayDate, relativeLabel, countdownLabel, upcomingDates,
    scheduledNight, nightDates,
    group: { name: "Friday Film Club", since: "2025-09-12" },
    today: TODAY, todayLabel: "Jun 15, 2026",
  };
})();
