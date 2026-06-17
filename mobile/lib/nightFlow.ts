import type { Night } from "./nights";

// The night wizard's three steps, tonight-only. The prototype's "When" step is
// Phase 3 (scheduling) and is intentionally absent here.
export type Step = "who" | "pick" | "recorded";

// deriveInitialStep maps a resumed night to the step the wizard should open on,
// so leaving and returning lands in the right place: an attached movie means the
// night is recorded; a recorded picker with no movie yet means we're mid-pick;
// otherwise the night is fresh and we start at attendance.
export function deriveInitialStep(night: Night): Step {
  if (night.movie !== null) return "recorded";
  if (night.pickerId !== null) return "pick";
  return "who";
}
