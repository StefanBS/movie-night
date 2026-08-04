# Handoff: Movie Night — App Redesign + "Plan a night on any date"

## Overview

This package redesigns the **Movie Night** app from three ad‑hoc screens into one
coherent app, and adds a new feature: **a movie night no longer has to be tonight —
you can schedule one for any date.**

Movie Night's rule never changes: **every night, one member's pick is law — no
voting, no vetoing.** The app keeps a fair rotation, remembers what was watched and
who chose it, and proposes who's up next. The redesign organizes everything around
that ritual — *see whose turn → run (or schedule) the night → it's remembered → the
rotation advances* — under a four‑tab structure: **Tonight · History · The Club ·
Settings.**

There are two deliverables here:
1. **The full screen architecture** (11 base screens) — what the app should be.
2. **The scheduling feature** (the new ask) — a date step in the night flow, a
   "planned" home state, and a scheduled‑night confirmation.

---

## About the design files

The files in `prototype/` are **design references built in HTML/React for the web.**
They are prototypes that show the intended **look, layout, copy, and behavior** — they
are **not** production code to copy directly.

Your task is to **recreate these designs in the real app's environment**: the
**Movie Night Expo app** (React Native, TypeScript, `expo-router`), reusing its
existing patterns, navigation, and data layer. Translate the web/CSS specifics
(CSS custom properties, `div`/`flex`, Google Fonts via `<link>`) into their React
Native equivalents (a typed theme object, `View`/`StyleSheet`, `expo-font`). Treat
the HTML as the source of truth for *what it should look like and do*, not for *how
to build it*.

### The target codebase

- **Repo:** `StefanBS/movie-night` @ `main`, the `mobile/` subtree
  (<https://github.com/StefanBS/movie-night/tree/main/mobile>).
- **Stack:** Expo + React Native + TypeScript, file‑based routing with `expo-router`
  (routes live in `app/`).
- **Existing routes to replace/expand:**
  - `app/index.tsx` — "Whose turn?" (turn ranking)
  - `app/night.tsx` — "Tonight" (attendance, movie search, record the pick)
  - `app/manage.tsx` — "Manage members"
- **Existing data layer:** `lib/*.ts` — typed modules for `members`, `nights`,
  `turn`, `movies`. **Reuse and extend these** — the redesign's data model (below) is
  a superset of what's already there; the scheduling feature mainly adds a *date* and
  a *scheduled (future) night* concept.

> The product **behavior and copy** come from that source. The **visual identity
> ("Spotlight")** is the design system in this bundle — adopt it wholesale; the repo
> still ships Expo's placeholder blue/gray, which should be fully replaced.

---

## Fidelity: **High‑fidelity**

These are pixel‑level mockups with final colors, typography, spacing, radii, shadows,
and interaction states. Recreate them faithfully using the exact token values in the
**Design Tokens** section. Where a measurement isn't listed, read it from the
prototype source (every value is an inline style or a `var(--token)`).

---

## Information architecture & route map

A **bottom tab navigator** is the backbone (the old app had no nav model). Suggested
`expo-router` layout:

```
app/
  _layout.tsx                 # Root stack
  welcome.tsx                 # First-run (modal/replace when no group)
  (tabs)/
    _layout.tsx               # Bottom tab bar: Tonight · History · The Club · Settings
    index.tsx                 # TONIGHT (home) — whose turn / Up next card
    history.tsx               # HISTORY (the shelf)
    club.tsx                  # THE CLUB (members)
    settings.tsx              # SETTINGS
  rotation.tsx                # Full rotation (pushed from Tonight)
  night/
    new.tsx                   # The night flow (steps: when → who → pick → done)
                              #   — or split into when.tsx / who.tsx / pick.tsx
  night/[id].tsx              # Night detail (pushed from History)
  member/[id].tsx             # Member profile (pushed from The Club)
  member/new.tsx              # Add member (sheet)
```

The night flow (`night/new.tsx`) is a **wizard**: `When → Who's here → The pick →
Done`. A *future* date short‑circuits the "pick" step and ends on **Scheduled**
instead of **Recorded** (the film is chosen later, on the night).

---

## Design Tokens

React Native has no CSS variables — create a typed theme module (e.g.
`lib/theme.ts`) and import it everywhere. Below are the exact values (from
`tokens/*.css` in this bundle).

### Color — "Spotlight"

The whole app lives in a dark indigo room. Ember is the spotlight and is **rationed**
— it almost always means "whose turn." Red is **destructive‑only**.

| Token | Hex | Use |
|---|---|---|
| `night-950` | `#0C0A1B` | Deepest — hero/marquee, tab‑bar bg, app backdrop |
| `night-900` | `#131129` | **Page** background (the dim room) |
| `night-850` | `#191634` | — |
| `night-800` | `#201C3D` | **Card** surface (velvet) |
| `night-700` | `#2B2552` | Raised/subtle surface |
| `night-600` | `#3A3068` | Hover/pressed, neutral toggle off |
| `night-500` | `#4E4287` | Muted fills, strong borders |
| `ember-400` | `#F68B36` | **Brand accent** — primary button, spotlight, mark |
| `ember-500` | `#E5752A` | Accent pressed |
| `ember-300` | `#FBA75A` | **Ember text/icons on dark** (accessible) → `accent-strong` |
| `moon-400`  | `#8C9CEC` | Cool secondary accent (sparingly) |
| `haze-100`  | `#F1EEFA` | **Primary text** |
| `haze-300`  | `#B4ADCF` | Secondary text |
| `haze-400`  | `#897FA6` | Tertiary text |
| `red-500`   | `#F07A6B` | Destructive only |
| `green-500` | `#6FCB97` | Success (rare) |

**Semantic aliases** (map these in the theme):
`text-primary → haze-100`, `text-secondary → haze-300`, `text-tertiary → haze-400`,
`text-on-accent → #1A1228` (ink on the ember button),
`surface-page → night-900`, `surface-card → night-800`, `surface-subtle → night-700`,
`surface-dark → night-950`, `accent → ember-400`, `accent-strong → ember-300`,
`accent-glow → rgba(246,139,54,0.45)`,
`surface-spotlight → rgba(246,139,54,0.15)` (the "next up" wash),
`border-hairline → rgba(228,224,247,0.11)`, `border-strong → rgba(228,224,247,0.20)`.

### Typography

| Family | Token | Where |
|---|---|---|
| **Instrument Serif** (400 only) | `font-display` | Wordmark, screen titles, movie names, dates, member names |
| **Hanken Grotesk** (400–700) | `font-sans` | All UI / body / buttons |
| **Space Mono** (400/700) | `font-mono` | Ticket‑stub metadata: counts, dates, uppercase tags/badges |

Scale (px): `12` mono tag · `14` meta · `16` body/input · `18` row name ·
`22` sans heading · `30` screen title (serif) · `34/40` big serif · `52/56` hero serif.
Line heights: display `1.05–1.1`, normal `1.45`. Display tracking `-0.01em`; mono
uppercase tags `+0.08em` (`tracking-caption`).

> **Mono uppercase** is the only uppercase in the app (badges like `NEXT UP`, `CORE`,
> `RECORDED ✓`, `SCHEDULED ✓`, and section labels).

### Spacing / radius / shadow / motion

- **Spacing** (4px grid): 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64. Screen
  gutters **16–20px**.
- **Radius:** `sm 6` (posters/tags) · `md 10` (buttons/inputs/rows) · `lg 16` (cards)
  · `xl 24` (sheets/hero) · `full 999` (avatars/pills).
- **Shadows (deep, inky):** `sm 0 1px 2px rgba(0,0,0,.30)` · `md 0 6px 18px
  rgba(0,0,0,.42)` · `lg 0 18px 44px rgba(0,0,0,.55)`.
- **Spotlight glow** (the signature): `glow-spotlight = 0 0 0 1px rgba(246,139,54,.5),
  0 6px 26px rgba(246,139,54,.32)`. In RN, approximate with a colored `shadow*` +
  a 1px ember border (or an absolutely‑positioned radial via `expo-linear-gradient`/
  a masked view).
- **Motion:** 130–220ms ease‑out (`cubic-bezier(0.16,1,0.3,1)`). Press = quick opacity
  dip to **0.72** (no bounce). Respect reduced motion.

---

## Fonts (Expo)

The prototype loads Instrument Serif, Hanken Grotesk, and Space Mono from Google
Fonts. **No font binaries are bundled.** For the app, add them with `expo-font` /
`@expo-google-fonts`:

```
npx expo install @expo-google-fonts/instrument-serif \
  @expo-google-fonts/hanken-grotesk @expo-google-fonts/space-mono expo-font
```

Load in the root layout with `useFonts({...})` and gate render until ready (or use
`SplashScreen.preventAutoHideAsync`). If you'd prefer different families, that's a
brand decision — flag it.

## Icons

The prototype uses **Lucide** glyphs (search, settings, chevron, clock, calendar,
plus, users‑round, clapperboard, history, film, check, ellipsis, shuffle, bell,
rotate‑ccw, log‑out). Use **`lucide-react-native`** — same names, ~2px stroke,
sizes on the grid (16/20/24), colored with `currentColor` ≈ `text-secondary` or
`accent-strong`. The app also uses Unicode `✓ → … ✦` as native marks (✦ is the
"spotlight spark" beside *next up*). **No emoji.**

---

## Screens / Views

Open `prototype/index.html` to see all of these laid out and grouped. Each phone is
**384×832** in the prototype (treat as a standard tall phone). Common chrome:

- **Top bar** — three kinds: `home` (logomark + wordmark "Movie Night" in serif +
  group name in mono + gear), `tab` (large left‑aligned serif title), `title`
  (centered serif title + ember back link).
- **Bottom tab bar** — `night-950` @ 86% + blur, 1px hairline top, four items
  (icon + 11px label); active item is `accent-strong` (ember).
- **Spotlight pattern** — the one emphasis style: active/next‑up item gets
  `surface-spotlight` wash + `inset 0 0 0 1px accent-glow` + an ember mono badge.

### 1. Welcome (first run)
- **Purpose:** A new group's first screen — states the rule before any setup.
- **Layout:** Centered marquee on `night-950` with an ember radial glow from the top.
  Logomark 92px (ember drop‑shadow) → "Movie Night" serif 52 → one‑line tagline →
  a `lg` card listing the 3 rules (mono number + sans line). Bottom: primary
  "Start a group →" + ghost "Enter an invite code."
- **Copy:** "Pick a movie together, without the squabble. Everyone gets their turn."
  Rules: "Each night, one member's pick is law." / "The app remembers what you
  watched." / "It proposes whose turn is next — fairly."

### 2. Tonight — home (no night planned)
- **Purpose:** Answer "whose turn is it?" at a glance and start a night.
- **Layout:** `home` top bar → **Spotlight hero** card (`surface-dark`, `xl` radius,
  `glow-spotlight`, ember radial): mono `✦ NEXT UP` → 64px avatar with ember glow ring
  → member name in serif 38 → mono meta ("First turn · hasn't picked yet" or "N picks
  · last <date>"). Below: primary **"Plan a night →"**, ghost "<First> can't make it
  — skip turn", then **On deck** (next 3, mono rank + sm avatar + picks count), then
  ghost "See full rotation →".

### 3. Tonight — home (a night IS on the calendar)  ← scheduling
- **Purpose:** When a night is scheduled, the home leads with it as a countdown.
- **Layout:** Same top bar → **"Up next" card** (`surface-dark` + `glow-spotlight`):
  header row `✦ NEXT MOVIE NIGHT` (ember mono) + a solid‑ember countdown pill
  (clock icon + "in 4 days"); serif 34 weekday+date ("Friday, Jun 19"); hairline
  divider; picker row (avatar + "<Name>'s pick" + mono "CHOOSES THE FILM THAT NIGHT")
  with an overlapping avatar cluster of who's coming. Buttons: **"Start the night"**
  (primary, full‑width) + **"Edit"** (secondary). Then On deck + ghost "Plan another
  night →".

### 4. The order (full rotation) — pushed from Tonight
- **Purpose:** The fair ranking, explained, with a skip control.
- **Layout:** `title` top bar ("The order", back "Tonight"). Info strip explaining
  fairness. Ranked list (mono rank + avatar + name + mono "N picks · last <date>");
  **rank 1 = spotlight treatment + "NEXT UP" badge.** Below: secondary "Skip <First>'s
  turn"; footer note "Guests and inactive members don't enter the rotation."

### 5–8. The night flow (`When → Who's here → The pick → Recorded`)  ← scheduling
A 4‑step wizard with a stepper (small ember‑filled step dots + short mono labels
`When · Here · Pick · Done`).

**Step 1 — When** *(new)*
- **Purpose:** Choose the date. Tonight, or any day ahead.
- **Layout:** Stepper → serif 30 "When's the night?" → sub "Tonight, or pick any date
  to plan ahead. We'll remind everyone." → **quick chips** (pills: "Tonight", "Fri 19",
  "Sat 20"; selected = solid ember) → **Calendar** in a `lg` card.
- **Calendar component spec:**
  - Header: serif month+year ("June 2026") + prev/next chevron buttons (34px, card bg).
  - Weekday row: `S M T W T F S` in mono 11, tertiary.
  - 7‑col grid; each day = 34px circle.
    - **Selected:** solid `accent` fill, `text-on-accent`, ember drop shadow.
    - **Today (unselected):** `inset 0 0 0 1.5px accent-strong` ring.
    - **Has a night:** a 4px ember dot under the number.
    - **Past days:** number dimmed to `text-tertiary` but still selectable (back‑fill).
  - Sticky footer: left mono "PLANNING"/"TONIGHT" + right ember relative label
    ("This Friday") + primary "Next: who's coming →".

**Step 2 — Who's here**
- **Purpose:** Attendance; the next‑up attendee becomes the picker. Carries the date.
- **Layout:** Stepper → row with serif weekday+date ("Friday, Jun 19") and an **ember
  DateChip** showing the relative label (tappable → back to When). Sub‑copy adapts:
  future → "Who's coming? The next‑up member who's in gets the pick."; tonight →
  "Tap who made it…". Member rows toggle present/absent (present dims to 0.5 when off);
  the picker row gets the spotlight + mono "GETS THE PICK"; trailing badge solid‑ember
  "✓ In" / mono "OUT". Footer button: future → "Schedule — <First> picks →"; tonight →
  "Next — <First> picks →".

**Step 3 — The pick** *(tonight path; skipped/deferred for a future night)*
- **Purpose:** The picker searches and chooses the film.
- **Layout:** Stepper → spotlight card (avatar + `✦ PICKING TONIGHT` + serif name) →
  `Input` "Search a film title…" with a "Search" button addon → results list (poster
  thumb 42×63 + serif title + mono year + chevron).

**Step 4a — Recorded** *(tonight)*
- **Purpose:** Confirm the night is saved to history.
- **Layout:** Centered: poster 150×222 (ember‑tinted shadow) → solid‑ember badge
  "Recorded ✓" → serif 34 title → mono "year · runtime" → "Picked by <Name> · <date>"
  → "Who watched" overlapping avatar cluster. Footer: "Done — back to rotation" + ghost
  "Change movie".

**Step 4b — Scheduled** *(future night)*  ← scheduling
- **Purpose:** Confirm a future night; the movie is chosen later.
- **Layout:** **Date hero** (`surface-dark` + `glow-spotlight`): solid‑ember
  "Scheduled ✓" badge → serif 40 weekday ("Friday") → serif 24 secondary full date
  ("Jun 19, 2026") → mono ember countdown row (clock + "in 4 days"). Then "On the
  night" spotlight row (picker avatar + "<Name> picks" + mono "CHOOSES THE FILM THAT
  NIGHT" + "✦ Up" badge); "Coming · N" avatar cluster. Footer: "Done" + ghost "Add to
  calendar" / "Notify the group".

### 9. History — the shelf (tab)
- **Purpose:** Everything watched — the product's "remembers what you watched" promise.
- **Layout:** `tab` top bar ("History" + mono "N nights · since …"). Stat strip card
  (3 `Stat` tiles: Nights / Films / Loved — "Loved" value in ember). Nights grouped by
  month (mono `SectionLabel`); each row = poster 48×71 + serif title + (sm avatar +
  "<First>'s pick") + right column (mono date + reaction glyph; `loved` glyph is ember).

### 10. Night detail — pushed from History
- **Purpose:** One night in full.
- **Layout:** `title` bar (back "History", trailing ellipsis). Editorial header:
  poster 118×175 left + (serif 30 title, mono "year · runtime", reaction badge) right.
  "The pick" **spotlight row** (picker avatar + name + mono "THEIR CALL · <DATE>").
  "Who watched · N" list (sm avatar + name; picker tagged with a "Picker" badge).

### 11. The Club — members (tab)
- **Purpose:** The group, framed around the rotation.
- **Layout:** `tab` bar ("The Club" + "N members · M in rotation") + an **AddBtn**
  (solid‑ember plus, top‑right). Sections: **In rotation** (mono rank + avatar + name +
  mono "N picks · last <date>"; rank 1 → "NEXT UP" badge, others → chevron); **Guests ·
  not in rotation** (neutral "Guest" badge); **Inactive** (dimmed). Rows push to profile.

### 12. Member profile — pushed
- **Purpose:** One person — stats and their picks.
- **Layout:** Centered 76px avatar → serif 32 name → role badge + mono "since <date>".
  Stats card (3 tiles: Picks / Last pick / In line — "#N" in ember). "<First>'s picks"
  list (poster 40×60 + serif title + mono year + date). Footer: secondary "Deactivate"
  (or "Promote" for a guest).

### 13. Add member — sheet
- **Purpose:** Add someone as core or guest.
- **Layout:** `Input` "e.g. Alex Rivera". "Join as" → two selectable cards, **Core**
  ("Enters the pick rotation") vs **Guest** ("Watches, never picks"); selected card =
  `surface-spotlight` + ember inset border + check. Helper note about new core members
  starting at zero picks. Footer: "Add to the club".

### 14. Settings (tab)
- **Purpose:** Group controls and the rule restated.
- **Layout:** `tab` bar ("Settings"). **House‑rule card** (`surface-dark`, ember
  glow): mono "THE HOUSE RULE" → serif 26 "One pick a night. No voting, no vetoing." →
  sub. Grouped rows (icon + label + value/toggle/chevron) in `lg` cards: **Group**
  (name, since); **Rotation** ("Allow skipping a turn" on; "Guests can pick" off);
  **Notifications** ("It's your turn" reminder; "Night recap"); **Danger zone**
  (red: "Reset pick history", "Leave group"). **Toggle** = 44×26 pill, `accent` when
  on / `night-600` off, white knob.

### 15. Edit night — pushed from the home "Up next" card (Edit)  ← scheduling follow-on
- **Purpose:** Change a scheduled night, or cancel it.
- **Layout:** `title` bar ("Edit night", back "Up next"). Header: an ember calendar
  tile (46px, `surface-spotlight` + inset ember border) + serif 26 weekday+date + mono
  "<countdown> · <First> picks". **Night settings** group (`lg` card rows): **Date**
  (value = full date → calendar), **Repeat** (value "Every Friday" in ember →
  Repeat screen), **Reminders** (value "Day before, morning of" → Reminders screen).
  **Who's coming · N** attendance list (sm avatar + name + "✓ In"/"OUT" toggle). Footer:
  primary "Save changes" + ghost **red** "Cancel this night".

### 16. Repeat (recurrence) — pushed from Edit  ← scheduling follow-on
- **Purpose:** Put movie night on a cadence; roll the rotation forward each occurrence.
- **Layout:** `title` bar ("Repeat", back "Edit"). Intro line. **How often** —
  radio‑style option rows (selected = `surface-spotlight` + ember inset + filled ember
  check circle): "Doesn't repeat" / "Every week (Fridays)" / "Every 2 weeks (Fridays)"
  / "Every month (Third Friday)". **Up next** preview group: the next 4 computed dates
  (mono `✦`/rank + serif weekday+date + mono countdown), recomputed live from the
  selection. Footer: "Done".
- **Logic:** `upcomingDates(startIso, intervalWeeks, count)` in `data.js` — advances
  from the start date by N weeks, skipping past dates, returns the next `count`.

### 17. Reminders — pushed from Edit  ← scheduling follow-on
- **Purpose:** Choose when and who the app nudges.
- **Layout:** `title` bar ("Reminders", back "Edit"). Intro. **When to remind** group
  (rows with icon + label + sub‑time + toggle): "The night before · 6:00 PM" (on),
  "Morning of · 9:00 AM" (on), "2 hours before · Final heads‑up" (off). **Who gets
  nudged** — two selectable cards: "Everyone coming" (selected) vs "Just the picker".
  Note strip (ember bell icon): "The next‑up member always gets a personal 'it's your
  turn' nudge, even if reminders are off for everyone else." Footer: "Done".

### 18. The nudge (lock‑screen notification) — reference, not a route  ← scheduling follow-on
- **Purpose:** Show how a reminder actually appears, so notification copy/format is
  specified.
- **Layout:** A **lock‑screen** mock (not app chrome): night gradient + ember top glow,
  centered date ("Thursday, June 18") + 76px clock ("9:41"), then a notification stack
  pinned to the bottom. **Notification card:** translucent `night-800` @ 72% + blur,
  20px radius; 38px app‑icon tile (logomark on `night-950` with ember glow); mono
  "MOVIE NIGHT" + time; sans‑600 title; sans‑13 body. The picker's card carries an
  ember inset border + the `✦` spark.
- **Copy (use verbatim):**
  - *To the picker (personal):* "✦ It's your turn — you pick Friday's movie" · "Friday
    Film Club · Jun 19. Come with a film in mind."
  - *To the group:* "Movie night is on for this Friday" · "Tomas picks · 4 going. Tap
    to RSVP."
  - *Confirmation:* "Reminder set" · "We'll nudge everyone the night before and the
    morning of."
- **Implementation:** Use **`expo-notifications`** — schedule local notifications at
  each enabled offset (night before 6pm, morning of 9am, 2h before) for the night's
  date; the picker gets an additional personal one. Request permission on first
  schedule. (Server push is only needed if reminders must fire when the app hasn't been
  opened to schedule them — confirm against your backend plans.)

### 19. Add to calendar (export sheet) — over the Scheduled screen  ← scheduling follow-on
- **Purpose:** Put the night on the user's real OS/Google calendar so it shows up
  outside the app.
- **Layout:** A **bottom sheet** over a dimmed Scheduled screen (`night-900`, `xl` top
  radius, grabber handle). Serif 26 "Add to calendar". **Event preview** card: a small
  date chip (ember weekday cap + day number) + sans‑600 "🎬 Movie Night — <First>
  picks" + mono "<weekday, date> · 7:30 PM ↻ <repeat label>". **Add to** — a list of
  the device's calendars, each a colored square + name + account (Personal · iCloud /
  Google / Work); selected = `surface-spotlight` + ember inset + filled check. If the
  night recurs, an **"Add the whole series"** toggle row (on → "<label>, recurring";
  off → "Just this one night"). Sticky CTA: "Add event(s)" + ghost "Not now".
- **Default event time** is 7:30 PM (placeholder — confirm desired default or make it
  editable). Title/notes should include the picker and the RSVP list.

### 20. On the calendar (confirmation)  ← scheduling follow-on
- **Purpose:** Confirm the event(s) were added and offer a jump to the calendar app.
- **Layout:** Centered ember **calendar‑check** badge (86px, glow) → serif 32 "On the
  calendar" → "Added to <Calendar>, recurring <label>. Everyone you invite gets it
  too." → **Next on your calendar** group listing the next 3 computed dates (calendar
  icon + serif weekday+date + "7:30 PM"). Footer: primary "Open calendar" + ghost "Back
  to Movie Night".
- **Implementation:** Use **`expo-calendar`** — request permission, let the user pick a
  writable calendar (`getCalendarsAsync`), then `createEventAsync` with an
  `recurrenceRule` when "whole series" is on (frequency/interval mapped from
  `night.repeat`). "Open calendar" deep‑links to the OS calendar. This is **separate
  from in‑app reminders** (screen 17): calendar export writes an event the user owns;
  reminders are local notifications the app fires.

---

## The scheduling feature (the new ask) — summary

Implement these specifics:

1. **A night has a `date` (ISO `YYYY-MM-DD`).** Default to today; allow any date.
2. **The night flow opens with the `When` step** (calendar + quick chips). A chosen
   date threads through the rest of the flow (header, copy).
3. **Future date ⇒ "scheduled" night:** the **picker is locked now** from the rotation,
   but `movie` stays `null` and is chosen on the night. The flow ends on **Scheduled**,
   not Recorded, and skips the film‑search step.
4. **Tonight (date == today) ⇒ runs straight through** to **Recorded** with the movie.
5. **The home reflects the next scheduled night** as the "Up next" countdown card,
   including a "↻ <repeat label>" line when it recurs. If none is scheduled, it shows
   the whose‑turn spotlight + "Plan a night".
6. **Follow‑ons (now designed — see screens 15–20):** **Edit night** (change date /
   recurrence / reminders / attendance, or cancel), **Repeat** (weekly / biweekly /
   monthly with a live next‑dates preview), **Reminders** (when + who to nudge),
   **The nudge** (lock‑screen notification format + verbatim copy), and **Add to
   calendar** (export to the OS / Google calendar, optionally the whole recurring
   series, via `expo-calendar`).

**Date logic** (mirror `prototype/data.js`): `daysUntil(iso)`, `weekday(iso, long)`,
`relativeLabel(iso)` (→ "Tonight" / "Tomorrow" / "This Friday" / "Next Friday" / full
date), `countdownLabel(iso)` (→ "tonight" / "tomorrow" / "in N days" / "N days ago"),
`fmtWeekdayDate(iso)` (→ "Friday, Jun 19"). Compute against the device's *today*, not a
hardcoded date.

---

## Data model & the turn‑order algorithm

Extend the existing `lib/` types. Shapes used by the prototype:

```ts
type Member = {
  id: string; name: string;
  role: 'core' | 'guest';
  status: 'active' | 'inactive';
  servedCount: number;            // times this member has picked
  lastPickedOn: string | null;    // ISO date
  joinedOn: string;               // ISO date
};

type Night = {
  id: string; date: string;       // ISO — NOW supports any date, past or future
  movie: string | null;           // null while scheduled; set when recorded
  pickerId: string;
  presentIds: string[];
  reaction?: 'loved' | 'liked' | 'okay';
  // scheduling follow-ons (present on a scheduled/future night):
  repeat?: {                       // omit or freq:'none' for a one-off
    freq: 'weekly' | 'monthly';
    intervalWeeks: number;         // 1 = every week, 2 = biweekly
    weekday: number;               // 0–6 (5 = Friday)
    label: string;                 // e.g. "Every Friday"
  };
  reminders?: {
    dayBefore: boolean;            // 6:00 PM the night before
    morningOf: boolean;            // 9:00 AM
    hoursBefore: boolean;          // 2h before
    audience: 'all' | 'picker';    // the picker always gets a personal nudge regardless
  };
};

type Movie = { title: string; year: number; runtime: string; /* +poster */ };
```

**Turn order** (the heart of "fairness") — active **core** members only, sorted by
**fewest `servedCount` first**, ties broken by **oldest `lastPickedOn`** (null = never
= earliest):

```ts
const turnOrder = (members: Member[]) =>
  members
    .filter(m => m.role === 'core' && m.status === 'active')
    .sort((a, b) =>
      a.servedCount !== b.servedCount
        ? a.servedCount - b.servedCount
        : (a.lastPickedOn ?? '0000-00-00').localeCompare(b.lastPickedOn ?? '0000-00-00'));
```

Guests and inactive members never enter the rotation. **Skipping** a turn should leave
`servedCount` unchanged (so the skipper stays near the front next time) — confirm the
exact rule against existing `lib/turn.ts`.

When a night is **recorded**, increment the picker's `servedCount` and set their
`lastPickedOn = night.date`, which advances the rotation.

---

## Interactions & behavior

- **Press feedback:** opacity dip to `0.72`, 130ms; no scale/bounce.
- **Web hover** maps to nothing on native — ignore the prototype's `onMouseEnter`
  brightening; keep the press dip.
- **Attendance** toggles are optimistic and save automatically (existing app copy:
  "attendance saves automatically").
- **Calendar:** tapping a day or a quick chip sets the selection; chevrons page months;
  selecting a quick chip should also jump the visible month if needed.
- **Wizard nav:** `When → Who → (Pick | —) → (Recorded | Scheduled)`. Back link returns
  to the previous step; "Cancel" exits the flow.
- **Empty states** (one honest line, mono/sans): no members → "No members yet."; no
  history → "No nights yet — start one."; no scheduled night → home shows the
  whose‑turn spotlight instead of the Up‑next card.

## State management

- **Wizard state** (local to the flow): `date`, `present: Set<id>`, derived `picker`,
  `movie`. Keep it in the flow route's component or a small context; persist on finish.
- **Global/persistent:** members, nights, the next scheduled night. The existing app
  has a data layer — extend it (e.g. add `nights` with future dates + a
  `scheduledNight` selector = the soonest night with `date >= today && movie == null`).
- **Derived selectors:** `turnOrder`, `nextScheduledNight`, `picksFor(memberId)`,
  `nightDates` (Set of ISO dates → calendar dots).

## Assets

- `assets/logomark.svg` — **"The Club"** mark (a ring of seven jewel‑toned friends with
  tonight's picker glowing ember at the top). Included here; the repo also has
  `app-icon.svg` / `logomark-mono.svg`. **Don't redraw it.** Render SVG in RN via
  `react-native-svg`. The wordmark is just "Movie Night" set in Instrument Serif.
- **Avatars** are deterministic initials chips (no photos): a hash of the name picks one
  of seven jewel tints drawn from the logo ring (see `tintFor`/`initials` in
  `prototype/chrome.jsx` via the design system's `Avatar`). Port this so a given person
  is always the same color.
- **Posters:** the real app shows **TMDB** posters (the only imagery). The prototype
  draws an offline placeholder — a hue‑per‑title gradient tile with the title in serif.
  In the app, load real TMDB poster URLs; keep the gradient/neutral tile as the
  loading/empty fallback.

## Files in this bundle

- `prototype/index.html` — the full screen set, grouped and annotated (open this first).
- `prototype/chrome.jsx` — phone shell, top bars, tab bar, **Calendar**, DateChip,
  Poster, Stat, section label, reaction map.
- `prototype/screens-core.jsx` — Tonight (home + planned), full rotation.
- `prototype/screens-night.jsx` — the night flow incl. **When**, date‑aware
  attendance, Recorded, **Scheduled**.
- `prototype/screens-shelf.jsx` — History, Night detail.
- `prototype/screens-group.jsx` — The Club, Member profile, Add member.
- `prototype/screens-setup.jsx` — Settings, Welcome.
- `prototype/screens-scheduling.jsx` — **the follow-ons:** Edit night, Repeat,
  Reminders, the lock-screen notification mock, and **Add to calendar** + its
  confirmation.
- `prototype/data.js` — seed data + the turn‑order algorithm + all date helpers
  (**the reference implementation for scheduling logic**).
- `tokens/*.css` — the exact token values (colors, typography, spacing, fonts).
- `assets/logomark.svg` — the brand mark.

> The components in the prototype reference a compiled design‑system bundle
> (`window.MovieNightDesignSystem_*`: `Button`, `Avatar`, `Badge`, `Banner`, `Input`,
> `MemberRow`, `IconButton`). Their styling is fully specified by the tokens above and
> by the screen specs — rebuild them as small RN components (`<Button variant=…>`,
> `<Badge tone= solid>`, `<Avatar name size>`, etc.).

---

### Suggested build order

1. Theme + fonts + icons wired (`lib/theme.ts`, `useFonts`, `lucide-react-native`).
2. Primitives: Button, Badge, Avatar, Input, Banner, MemberRow.
3. Tab navigator + the four tab screens (read‑only against existing data).
4. The night flow **with the When step** + Recorded/Scheduled branch.  ← the feature
5. Home "Up next" card driven by the next scheduled night.
6. Pushed screens (rotation, night detail, member profile, add member), Welcome.
