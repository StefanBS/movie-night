import { daysUntil, todayLocalISO } from "./date";
import type { Night } from "./nights";

// The Night lifecycle: the one owner of a Night's date-relative state and the
// selectors built on it (see GLOSSARY.md). Every Night has a picker (ADR-0008)
// and attaching a film never changes its state, so the state is a function of
// the date alone. It lives on the client because the backend has no group
// timezone. ISO YYYY-MM-DD compares chronologically as text, so there is no
// Date parsing. `today` is injectable for deterministic tests (mirrors date.ts).

export type NightTiming = "upcoming" | "tonight" | "past";

// nightTiming classifies a date: after today is upcoming, today is tonight,
// before today is past. Takes the date (not a Night) so the When step can
// classify a date before any Night exists.
export function nightTiming(scheduledFor: string, today: string = todayLocalISO()): NightTiming {
  const d = daysUntil(scheduledFor, today);
  if (d > 0) return "upcoming";
  if (d === 0) return "tonight";
  return "past";
}

// upNext is the home "Up next" selector: the soonest Night dated today or
// later, or null when none (the spotlight is then the fallback). Tonight's
// Night stays up next all day, film or not.
export function upNext(nights: Night[], today: string = todayLocalISO()): Night | null {
  let soonest: Night | null = null;
  for (const n of nights) {
    if (nightTiming(n.scheduledFor, today) === "past") continue;
    if (soonest === null || n.scheduledFor < soonest.scheduledFor) {
      soonest = n;
    }
  }
  return soonest;
}

// historyNights is the History selector: Nights dated today or earlier, in the
// order given. Tonight's Night shows here as soon as it exists (as well as in
// Up next); upcoming Nights never do.
export function historyNights(nights: Night[], today: string = todayLocalISO()): Night[] {
  return nights.filter((n) => nightTiming(n.scheduledFor, today) !== "upcoming");
}

// nightDates is the calendar-dots selector: the dates that already hold a
// Night. A group has at most one Night per date.
export function nightDates(nights: Night[]): Set<string> {
  return new Set(nights.map((n) => n.scheduledFor));
}
