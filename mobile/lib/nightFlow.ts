import type { Night } from "./nights";

// The night wizard's three steps, tonight-only. The prototype's "When" step is
// Phase 3 (scheduling) and is intentionally absent here.
export type Step = "who" | "pick" | "recorded";

// deriveInitialStep maps a resumed night to the step the wizard should open on.
// An attached movie means the night is recorded, so we open there. Otherwise we
// always resume at attendance ("who") — even when a picker was already recorded:
// "pick" is a forward-only transition, not a resume target, so resuming there
// would skip step 1. Attendance persists and the picker is re-derived from the
// turn order (re-recorded idempotently on advancing), so re-entering at "who" is
// non-destructive. The same in-progress night is resumed (no duplicate night).
export function deriveInitialStep(night: Night): Step {
  if (night.movie !== null) return "recorded";
  return "who";
}
