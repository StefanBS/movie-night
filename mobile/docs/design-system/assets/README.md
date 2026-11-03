Logo files. Use them as they are; never redraw or recolour the mark.

- `logomark.svg` — the mark for dark grounds (`surface-page` in the dark theme).
- `logomark-light.svg` — the mark for light grounds (`surface-page` in the light theme).
- `logomark-mono.svg` — single-ink mark drawn in `currentColor`. Shown through `<img>` it renders black, so inline the SVG and set `color` (usually `text-primary`) when you need it in another ink.
- `app-icon.svg` — 1024px iOS app icon.
- `app-icon-foreground.svg` — Android adaptive-icon foreground, placed on `#11100E` (`ink-950`).

All files are centred on the calendar body, so the binder tabs sit above centre and the square reads as centred in a tile or beside text.

In UI, prefer the `Logomark` component: its frame follows `currentColor` and its play button is always `accent`.
