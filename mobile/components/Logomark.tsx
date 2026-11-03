import MarkDark from "../assets/brand/logomark.svg";
import MarkLight from "../assets/brand/logomark-light.svg";
import { useScheme } from "../theme/useColors";

// Logomark renders the brand mark: a calendar page with a terracotta play
// button (the film is the group's plan for the day). The SVGs in assets/brand/
// are the source of truth, copied byte for byte from the design system: never
// redraw or recolour them. Each theme has its own file (frame in text.primary,
// play in accent). Imported as components via react-native-svg-transformer
// (see metro.config.js). The mark is centred on the calendar body, so the
// binder tabs rise above centre: centre it as a box and it reads as centred.
export function Logomark({ size = 30 }: { size?: number }) {
  const Mark = useScheme() === "light" ? MarkLight : MarkDark;
  return <Mark width={size} height={size} />;
}
