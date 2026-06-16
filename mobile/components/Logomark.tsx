import Mark from "../assets/brand/logomark.svg";

// Logomark renders the Spotlight brand mark (the ring of friends with tonight's
// picker glowing ember at top). The SVG is the source of truth — never redraw it.
// Imported as a component via react-native-svg-transformer (see metro.config.js).
export function Logomark({ size = 30 }: { size?: number }) {
  return <Mark width={size} height={size} />;
}
