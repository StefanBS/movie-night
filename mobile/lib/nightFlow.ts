import { daysUntil, todayLocalISO } from "./date";
import type { Night } from "./nights";

// The night wizard's steps. "when" is the entry (date picker); "night" is the
// single terminal — one editable view for a night whatever its date or
// completeness (it replaced the old "recorded"/"scheduled" split).
export type Step = "when" | "who" | "pick" | "night";

// deriveInitialStep maps a resumed night to the step the wizard should open on.
// A film-set night, or a future picker-locked night (film optional), resumes on
// the unified Night terminal; a film-less tonight/past night resumes on "who"
// (the picker is re-derived on advancing; "pick" stays forward-only). `today` is
// injectable for deterministic tests (mirrors lib/date.ts).
export function deriveInitialStep(night: Night, today: string = todayLocalISO()): Step {
  if (night.movie !== null) return "night";
  if (night.pickerId !== null && daysUntil(night.scheduledFor, today) > 0) return "night";
  return "who";
}

// isResumable reports whether the group's latest night should be re-opened when
// the night wizard mounts. A future night is always resumable — a scheduled
// night stays editable even once a film is pre-picked. A tonight/past night is
// resumable only until a film attaches; once recorded it's done, so "Plan a
// night" starts fresh rather than re-opening a finished night. `today` is
// injectable for deterministic tests.
export function isResumable(night: Night, today: string = todayLocalISO()): boolean {
  if (daysUntil(night.scheduledFor, today) > 0) return true;
  return night.movie === null;
}
