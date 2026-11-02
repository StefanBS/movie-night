Logo files. Use them as they are; never redraw or recolour the mark.

- `logomark.svg` — the mark for dark grounds (`surface-page` in the dark theme).
- `logomark-light.svg` — the mark for light grounds (`surface-page` in the light theme).
- `logomark-mono.svg` — single-ink mark drawn in `currentColor`. Shown through `<img>` it renders black, so inline the SVG and set `color` (usually `text-primary`) when you need it in another ink.
- `app-icon.svg` — 1024px iOS app icon.
- `app-icon-foreground.svg` — Android adaptive-icon foreground, placed on `#11100E` (`ink-950`).

In UI, prefer the `Logomark` component: its frame follows `currentColor` and its play button is always `accent`.
