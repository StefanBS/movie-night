@AGENTS.md

## Design system — "Spotlight"

The app uses the Movie Night "Spotlight" design system. Tokens live in
`mobile/theme/` (typed TS). **Never hardcode colors, type, spacing, radii or
shadows** — import from `theme/` and reference the semantic groups
(`colors.text.*`, `colors.surface.*`, `colors.accent.*`, `colors.border.*`,
`space`, `radius`, `shadow`, `textPresets`).

Identity: deep indigo night-sky background, moonlit off-white text, one bonfire
**ember** accent answered by a cool **moon** accent. **Ember is rationed — it
means "whose turn it is"** (the picker / "next up" element gets `surface.spotlight`
+ an ember border + `shadow.spotlight`). Moon is for links/secondary accents.
Primary button = ember fill with `text.onAccent` ink. Type: Instrument Serif
(titles/wordmark/movie names), Hanken Grotesk (UI/body), Space Mono (counts,
dates, UPPERCASE status tags). Sentence case except mono tags. No emoji (only
`✓ → … ✦`). 4px grid; 10px buttons/rows, 16px cards. Brand logos are the SVGs in
`mobile/assets/brand/` — don't redraw the mark.
