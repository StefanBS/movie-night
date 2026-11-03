The Movie Night mark: a calendar page with an ember play button. Mirrors the app's `Logomark`.

```jsx
<Logomark size={22} />            // TopBar home, beside the wordmark
<Logomark size={64} tile />       // app-icon tile
```

Frame takes `currentColor` (primary text); the play button is always `--accent`. Wordmark: "Movie Night", Schibsted Grotesk 800, −0.03em. Minimum size 16px. Static files in `assets/` (`logomark.svg`, `logomark-light.svg`, `logomark-mono.svg`, `app-icon.svg`, `app-icon-foreground.svg`). Don't redraw or recolour the mark.

**Centring.** The mark is centred on the calendar body, not on its full silhouette: the two binder tabs rise above the 32-unit box's optical centre, and the play button sits in the middle of the body. Centre the component (or the SVG files) as a box and it will look centred.
