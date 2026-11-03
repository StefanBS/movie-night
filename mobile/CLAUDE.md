@AGENTS.md

## Design system: "Spotlight, refined"

The app uses the Movie Night "Spotlight, refined" design system, in a warm
true-black dark theme (the default) and a warm off-white light theme that
follows the OS. Tokens live in `mobile/theme/` (typed TS). **Never hardcode
colours, type, spacing, radii or shadows.** Import from `theme/` and use the
semantic groups (`colors.text.*`, `colors.surface.*`, `colors.accent.*`,
`colors.border.*`, `colors.sig`, `space`, `radius`, `shadow`, `textPresets`).

- **Theme-aware styles.** Build sheets with
  `createThemedStyles((colors, shadow) => ({ ... }))` and call the hook it
  returns. Use `useColors()` for inline colours such as icon props. Keep
  `theme/colors.ts` free of react-native, because `lib/` imports it in Node
  tests.
- **The film leads.** Once a night has a film, its title is the headline.
  The picker is a credit line under it ("Picked by Priya", "Tomas is
  picking"): the `Credit` component, with a 28px avatar. Only Tonight's hero
  with no night planned (`PickerHero`) makes the picker's name the headline.
- **One primary action per screen**, and none on a recorded night. Secondary
  actions (Change film, Edit night, Clear film) go behind a ⋯ `IconButton`
  that opens a `Sheet`.
- **The accent is rationed.** Terracotta (`accent.*`) goes on the picker
  (the `Next up` badge, a small bar or dot, never the avatar) and on that one
  primary action. Nowhere else. Links are `text.link`, not accent. Disabled
  buttons turn neutral (`surface.subtle` fill, `text.tertiary` label), never
  a faded accent.
- **Nothing glows.** No glows, washes or halos, except `shadow.focus` on a
  focused control. Shadows only on floating surfaces.
- **Member colours.** Avatars use `signatureColor(name, colors.sig)` from
  `lib/avatar.ts`, with `text.onSig` initials and no ring.
- **Type.** Schibsted Grotesk for everything (`fontFamily.display` 800 for
  names and titles, the sans weights for UI and body). Newsreader, upright at
  500 (`textPresets.filmTitle`), for film titles and the one serif line under
  a title. No italics anywhere. Spread `tabular` only where there are numbers
  (counts, dates), not on prose.
- **Copy.** Sentence case everywhere, including badges and section labels.
  No uppercase and no `textTransform: "uppercase"`. No emoji: only `✓ → …`
  (the `✦` spark is retired).
- **Shape.** 4px grid. Buttons and badges are pills, inputs 12px, cards
  18px, hero cards and sheets 28px, posters 4px. Lists sit flush on the page
  with hairline dividers. Cards are only for discrete objects.
- **Navigation.** Four tabs: Tonight, Upcoming, Watched, Club, with Lucide
  icons; the active tab is `text.primary`, never accent. Settings is a stack
  screen opened from the gear in Tonight's top bar. Back links name the
  previous screen (`TopBar`'s `back.label`). Flow footers (`WizardFooter`)
  are solid with a hairline top edge and carry one summary line.
- **Logo.** The mark is a calendar page with a play button, centred on the
  calendar body so the binder tabs rise above centre. Its SVGs in
  `mobile/assets/brand/` are copied byte for byte from the design system.
  Never redraw or recolour them. In UI use the `Logomark` component, which
  picks `logomark.svg` or `logomark-light.svg` for the theme. The icons,
  Android adaptive layers, splash and favicon in `assets/*.png` are rendered
  from those SVGs by `just icons`; don't edit the PNGs by hand. The splash
  follows the OS theme (the Android adaptive and dark splash background is
  `#11100E`). Icons and splash are native: rebuild the dev client after
  re-rendering.
- **Source of truth.** `mobile/docs/design-system/` holds every value: its
  README, `tokens.json` and `components/src/**/*.jsx`. Each component's
  `components/<Name>/README.md` is its spec, and
  `design_handoff_app_redesign/app-screens/` shows every screen. It's a
  snapshot of the design tool's export; to update it, replace the folder in
  one commit (minus its `mobile/assets/` PNGs, which show the retired ring
  mark). Don't add deprecated aliases (`--night-*`, `--moon-*`,
  `--accent-cool*`, `--glow-spotlight`, mono fonts).
