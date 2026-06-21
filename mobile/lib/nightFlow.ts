import { daysUntil, todayLocalISO } from "./date";
import type { Night } from "./nights";

// The night wizard's steps. "when" is the entry (date picker); "scheduled" is the
// terminal for a future night (picker locked, film chosen on the night).
export type Step = "when" | "who" | "pick" | "recorded" | "scheduled";

// deriveInitialStep maps a resumed night to the step the wizard should open on. A
// future night whose picker is locked (movie still null) resumes on the Scheduled
// confirmation; everything else keeps today's behaviour — recorded when a movie is
// attached, otherwise the non-destructive "who" (the picker is re-derived on
// advancing; "pick" stays a forward-only transition, never a resume target).
// `today` is injectable for deterministic tests (mirrors lib/date.ts).
export function deriveInitialStep(night: Night, today: string = todayLocalISO()): Step {
  if (night.movie !== null) return "recorded";
  if (night.pickerId !== null && daysUntil(night.scheduledFor, today) > 0) {
    return "scheduled";
  }
  return "who";
}

// isResumable reports whether the group's latest night should be re-opened when
// the night wizard mounts. A night is in progress until a film is attached;
// once a movie is recorded the night is done, so "Plan a night" must NOT resume
// it — otherwise a finished (possibly weeks-old) night reappears instead of a
// fresh wizard, and "Done — back to rotation" can never escape it. A done night
// is still viewable/correctable from History; it just isn't a resume target.
export function isResumable(night: Night): boolean {
  return night.movie === null;
}
