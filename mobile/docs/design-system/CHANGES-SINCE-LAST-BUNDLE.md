# Movie Night design system: changes since the last bundle

Everything in the previous bundle is already in the app (`StefanBS/movie-night`, `mobile/`). This file lists only what changed since then, as seven changes. The rest of `project/` is the full, current design system for reference.

**Where to look**
- Components: `project/components/<Name>/README.md` (guidelines), `<Name>.d.ts` (props) and `project/components/src/**` (web reference source; the app mirrors these in React Native).
- Tokens: `project/tokens.json`, plus the CSS variables in `project/components/bundle.css`.
- Screens: `project/design_handoff_app_redesign/app-screens/*.jsx`. To see them, serve the `project/` folder (e.g. `npx serve project`) and open `/design_handoff_app_redesign/app-screens/index.html`. Board numbers below refer to that page (25 screens).

---

## 1. Smaller picker hero on Tonight

When no night is planned, Tonight shows "**Tomas** picks the film." It was oversized.

- Name: 84–96px → **52px** (`display` style: weight 800, line-height 0.95, tracking −0.045em).
- "picks the film.": ~35px → **24px** Newsreader 500, line-height 1.15, 4px below the name.
- Terracotta bar under it: 44×4 → **36×3**, 14px below.
- Token: `type.groups[Display].display` is now 52px; `--text-display` is 52px in `components/bundle.css` and `tokens/typography.css`.

Board 02 (Tonight). Code: `PickerHero` in `app-screens/chrome.jsx`.

## 2. UpNextCard: poster and film details

The card now shows the film's poster and details. The film stays the headline and the picker stays a credit line.

- **Poster** 88×132 (`Poster`, `radius-sm`, `shadow-sm`) on the left. TMDB poster when there is one, else the hue tile.
- **Title** beside it: Newsreader 500, 30px (`--text-2xl`), line-height 1.08. **Never truncated**: it wraps over as many lines as it needs.
- **Details**, one per line under the title, `--text-sm`, `text-tertiary`, tabular figures:
  - year ("2000")
  - genres, comma-separated ("Drama, Romance"), **one line, cut with "…"** if too long
  - runtime ("1h 38m")
  Leave out any line you don't have; never show a placeholder.
- The text block is bottom-aligned with the poster.
- **No film yet**: an empty 88×132 slot (1.5px inset `border-strong` outline) beside "Not picked yet." in `text-tertiary`, with no detail lines. The credit reads "**Tomas** is picking".
- New props: `posterUri`, `hue`, `year`, `genre` (`string | string[]`), `runtime`.
- **Data**: the app needs the TMDB poster path, genres and runtime for the chosen film. Fetch them from TMDB movie details when the film is picked, and store them with the night/movie if they aren't stored already.

Files: `components/UpNextCard/{README.md,UpNextCard.d.ts}`, `components/src/night/UpNextCard.jsx`. Boards 08, 09.

## 3. UpNextCard: the main button follows the night ("Start the night" is gone)

"Start the night" meant nothing; it only opened a screen that repeated the card. The card's one primary button is now the next thing the group has to do:

| Night | Primary button | What it does |
| --- | --- | --- |
| No film yet | **Choose the film** | Opens the film search for the picker (Movie step, board 06). |
| Film chosen, and the night is today or has passed without being saved (`due`) | **We watched it** | Confirms who came (the People step, board 05, pre-filled with who's coming), then Done (board 07) saves the night to Watched and moves the rotation on. |
| Film chosen, night still ahead | none | Nothing to do yet. |

- "Edit" (secondary) is always there.
- Tapping the card outside the buttons opens the night (Night · upcoming, board 10).
- Props: remove `onStart`; add `due`, `onChooseFilm`, `onWatched`, `onOpen`. `due` = the night's date is today or earlier and it isn't recorded yet.
- If the app has no flow yet that records a *planned* night as watched, this change adds one: reuse the People and Done steps.

Files: `components/UpNextCard/*`, `components/src/night/UpNextCard.jsx`. Boards 08 (Choose the film), 09 (We watched it).

## 4. Three tabs: Upcoming is removed; planned nights live on Tonight

The group plans ad hoc, so Upcoming would mostly hold one entry, the same night Tonight already shows.

- **TabBar**: Tonight (`clapperboard`) · Watched (`library`) · Club (`users-round`). Remove the Upcoming tab, its route and its screens.
- **Tonight with a night planned**: the next night is the UpNextCard. Any *other* planned nights are listed under it, under a section label **"Also planned"**. Each row has a 28px avatar of that night's picker, "Sat 27 Jun · 8 pm" (16px, 600), "Priya picks" under it (14px, `text-secondary`) and a chevron. The row opens that night, and rows are separated by hairlines. Hide the section when there's only one planned night.
- Then the existing "Then" queue.
- Back links on the Night screen say "Tonight" (never "Upcoming").
- Recurring nights don't change: they're set in Edit night › Repeat, which previews the next dates. Reminders and Add to calendar are unchanged.

Files: `components/TabBar/*`, `components/src/navigation/TabBar.jsx`, `app-screens/screens-core.jsx` (`AlsoPlanned`, `PlannedHomeScreen`). Board 08.

## 5. Watched: no counters, no "Loved"

- Remove the stats row (Nights / Films / Loved) on the Watched tab. The list starts right under the title and its "11 nights since Sep 12 2025." line.
- Remove the ♥ after "Marcus's pick" on rows.
- Night · past: remove the "Loved it" badge. The credit line is followed directly by "Who watched".
- Reactions aren't planned yet: remove the UI only. Leave any data model alone unless it's unused scaffolding.

File: `app-screens/screens-shelf.jsx`. Boards 18, 19.

## 6. New night › Date: no quick-date chips

Remove the "Tonight / Fri 19 / Sat 20" chips above the calendar. The calendar opens on the current month with today ringed, so tonight is still one tap away. Start time and the footer summary are unchanged.

File: `app-screens/screens-night.jsx` (`NightDateScreen`). Board 04.

## 7. Watched: one continuous list, no month headers

With one night a month, a month header and a big gap sat above every row. Each row already shows its date ("May 30"), so:

- Drop the month section headers. The list is one continuous run of rows, newest first, 12px under the title block, with hairlines between rows.
- Only a year *earlier than the current one* gets a section label ("2025"), 24px above its first row.

File: `app-screens/screens-shelf.jsx` (`groupByYear`, `HistoryScreen`). Board 18.

---

Design-system-only changes (nothing to do in the app): the screens are now also shown as `components/Screens*` cards on the design system page, and the Button docs use "Choose the film" as their example label.
