# Movie Night — Design System

A design system for **Movie Night**, an app that organizes movie nights for a group of friends under one firm, anti-bikeshedding rule: **every night, one person's pick is law.** No voting. No vetoing. The app keeps the rotation fair, remembers what you watched and who chose it, and proposes whose turn is next.

> The product rules, in the app's own words:
>
> 1. Every movie night a different group member gets to pick the movie — **not subject to debate.** No voting, no vetoing.
> 2. The app keeps track of the movies watched and who has gotten their pick.
> 3. The app proposes the pick order from history to keep things fair. The picker can **skip** their turn so someone else gets to choose.

Movie Night is an **Expo app** (React Native) targeting **iOS, Android, and web** from one codebase.

> **Identity: Spotlight, refined.** Warm neutrals, one terracotta accent, Schibsted Grotesk and Newsreader. This is the only identity in the system; the earlier indigo look and its files are gone.

References: Letterboxd, A24, VHS era.

---

## Sources

- **GitHub — `StefanBS/movie-night` @ `main`**, `mobile/` subtree (see `github.md`). The app already implements the four-tab redesign. Its tokens live in `mobile/theme/{colors,typography,spacing}.ts` and its components in `mobile/components/`. Every component here mirrors one there by name and props.

---

## The concept — "Spotlight, refined"

One person picks; the app says so plainly. The picker's **name**, set huge, is the spotlight. A single **terracotta** mark backs it up. Everything else steps back: warm neutrals, hairlines, and the posters, which carry the colour.

- **The name is the emphasis — until there's a film.** With no night planned, Tonight sets the picker's first name at 64–96px, heavy and tight, followed by "picks the film." in the serif. Once a night is scheduled, the up-next card leads with the film title and credits the picker beneath it ("Picked by Tomas"). No glows, washes, or stacked badges.
- **The accent is rationed.** Terracotta, toned to sit with the member colours. It appears on the picker (a small bar or dot, the `Next up` badge — never on the avatar) and on the one primary action per screen. Nowhere else.
- **Each member has a colour.** Seven signature colours (`--sig-1…7`), hashed from the name, so a person is recognisable across avatars, lists and history.
- **Two themes, one scale.** Warm true-black (dark, default) and warm off-white (light) both come from the `--ink` scale.

---

## Content fundamentals

- **Voice: a calm, plain-spoken referee.** States what's happening and what to do; never sells. "Five of you are coming. No voting, no vetoes."
- **Sentence case everywhere** — titles, buttons, badges, section labels. **No uppercase**, including badges (`Next up`, `Recorded ✓`, `Guest`).
- **The sentence is the headline.** Where it fits, the home reads as a sentence: "**Tomas** picks the film." (name in the grotesk, the line in the serif) Use first names in headlines.
- **Short, concrete, low-drama.** Correct plurals ("1 pick" / "3 picks"), plain dates ("Fri 19 Jun · 8 pm"). Empty states are one honest line.
- **Errors are blunt but kind**, prefixed with the failed intent: "Couldn't load turn order: …".
- **Glyphs, not emoji.** `✓`, `→`, `…` only. The `✦` spark is retired.

---

## Visual foundations

- **Colour.** Dark: page `--ink-950 #11100E`, cards `--ink-900 #1A1816`, text `--ink-100 #EDE8E0` / `--ink-400` / `--ink-450`. Light (`data-theme="light"`): page `--ink-50 #F4F1EC`, cards white, text `--ink-950` / `--ink-600` / `--ink-500`. Accent is **terracotta** (tokens keep the `--ember-*` name): `#C8693F` (dark) / `#A9552F` (light), hover and accent text on light `--ember-600 #934826`. Labels on the accent use `--text-on-accent`: ink in dark, white in light. Red is destructive-only; green is rare.
- **Signature colours.** "Film stock": dusty, desaturated mid-tones. `--sig-1…7` = gold, teal, lilac, sage, rose, sky, sand (‑300 on dark, slightly deeper ‑600 on light), white initials (`--text-on-sig`) on both themes. Avatars carry no ring or accent. Hash = sum of char codes mod 7 (same as `lib/avatar.ts`).
- **Type.** **Schibsted Grotesk** for everything: 800 with −0.045em tracking for names and titles (44–96px), 600–700 for UI, 400 for body; tabular figures for counts and dates. **Newsreader**, upright at 500, for film titles and the one serif line under a title. No italics anywhere. Scale: 12 · 14 · 16 · 18 · 22 · 30 · 44 · 64 · 96.
- **Spacing.** 4px grid. Screen gutters 20–24px.
- **Shape.** Buttons and badges are pills. Cards 18px, hero cards 28px, inputs 12px, posters 4px.
- **Surfaces.** Lists sit flush on the page with hairlines — no card around a list. Cards only for discrete objects (the up-next night, settings groups, toasts).
- **Elevation.** Quiet, theme-specific shadows on floating surfaces only. Nothing glows.
- **Imagery.** TMDB posters, untreated, 2:3. Without a poster, a hue-per-title tile titled in Newsreader.
- **Interaction.** Press = opacity to 0.72. Hover (web): primary brightens, ghost text goes to primary colour. Motion 130–220ms ease-out; respect reduced motion.

### Bringing the app up to date

The app still carries the earlier theme. In `mobile/theme/`: `palette` takes the `ink`, `ember` and `sig` scales from `tokens.json`; `colors` becomes `colors.dark` / `colors.light` behind a `useColors()` hook; `avatarTints` becomes the seven `sig` values per theme; `app.json` `userInterfaceStyle` becomes `"automatic"`. Drop the old names (`night-*`, `haze-*`, `moon-*`, `accent-cool*`, `moon-glow`, `glow-spotlight`, the mono font): the system no longer defines them.

---

## Iconography

- **Logo.** A calendar page with an ember play button: the film is the group's plan for the day. `Logomark` component; frame in `currentColor`, play always `--accent`. Wordmark "Movie Night" in Schibsted Grotesk 800, −0.03em. The mark is centred on the calendar body, so the two binder tabs rise above centre. Files: `assets/logomark.svg` (dark), `logomark-light.svg`, `logomark-mono.svg`, `app-icon.svg` (1024, iOS), `app-icon-foreground.svg` (Android adaptive, on `#11100E`).
- **UI icons:** [Lucide](https://lucide.dev), 2px stroke, 16/20/24, `currentColor` (usually `--text-secondary`; `--text-primary` when active). Never ember unless it's the picker or the primary action.
- **No emoji.**

---

## Fonts

Google Fonts on web (`tokens/fonts.css`). For Expo, replace the bundled Instrument Serif / Hanken Grotesk / Space Mono `.ttf` files with **SchibstedGrotesk** Regular, Medium, SemiBold, Bold, ExtraBold and **Newsreader** Regular and Medium (upright), registered via `expo-font`.

---

## Index / manifest

- `styles.css` — global entry; `@import`s the token files. **Consumers link this.**
- `tokens/fonts.css` · `tokens/colors.css` (both themes) · `tokens/typography.css` · `tokens/spacing.css`.
- `guidelines/*.card.html` — foundation & brand cards.
- `github.md` — the app repository and where its tokens and components live.

## Components

Each mirrors the app component of the same name in `mobile/components/`.

- `components/src/core/` — **Button** (app: AppButton), **IconButton**, **Logomark**
- `components/src/forms/` — **Input**, **Toggle**, **Calendar**
- `components/src/feedback/` — **Badge**, **Banner**, **Toast**, **Stepper**
- `components/src/data/` — **Avatar**, **MemberRow**, **Poster**, **Stat**, **SectionLabel**, **SettingsRow**
- `components/src/navigation/` — **TopBar**, **TabBar**
- `components/src/night/` — **UpNextCard**

Each component's guidelines, types and live preview are in `components/<Name>/`.

Not mirrored: `TabScrollView`, `ToastProvider` (behaviour only).

**Navigation.** Four tabs: Tonight, Upcoming, Watched and Club (see `components/TabBar/`). Settings opens from the gear in the Tonight top bar and is not a tab.

## Mobile App

- `design_handoff_app_redesign/app-screens/` — all 26 screens in Spotlight, refined, with a dark/light switch (the Mobile App card). Tabs: Tonight, Upcoming, Watched, Club.
- **Screen patterns.** The film leads and the picker is a credit line under it ("Picked by Priya", "Tomas is picking"). A screen has at most one primary action; a recorded night has none. Secondary actions (Change film, Edit night, Clear film) live behind a ⋯ button in a sheet. Flow footers are solid with a hairline on top and carry one summary line ("Friday, Jun 19 · 8:00 pm · in 4 days"). Back links name the screen you came from.
- `templates/whose-turn/` — the rotation screen as a starting template (dark/light tweak).

## Design System files

- `tokens.json` — every colour (dark and light), type style, spacing step, radius, shadow, border width and the pressed opacity; `tokens.css` is compiled from it. Use these names, not raw values.
- `components/bundle.css` — the CSS variables `tokens.json` does not hold: the `--text-*` sizes, `--weight-*`, `--leading-*`, `--tracking-*`, and motion (`--ease-*`, `--duration-*`). Load it after `tokens.css`.
- `components/bundle.js` — the nineteen components, built from `components/src/`; it defines `window.MovieNightDesignSystem_b54ad3` (load React 18 and ReactDOM 18 first). Every card, preview, app screen and the whose-turn template load it.
- `components/<Name>/` — each component's guidelines (`README.md`), types (`<Name>.d.ts`) and live preview (`preview.html`); `components/index.d.ts` gathers all the types.
- `assets/README.md` — which logo file to use where.
