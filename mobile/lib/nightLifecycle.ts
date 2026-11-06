import {
  countdownLabel,
  daysUntil,
  formatShortDate,
  formatStartTime,
  formatWeekdayDate,
  relativeLabel,
  todayLocalISO,
} from "./date";
import type { Night } from "./nights";

// The Night lifecycle: the one owner of a Night's state and the selectors
// built on it (see GLOSSARY.md). Every Night has a picker (ADR-0008) and
// attaching a film never changes its state. Its timing is a function of the
// date alone, and lives on the client because the backend has no group
// timezone. Whether it has happened is the group's call: a Night stays planned
// until it is recorded as watched (watchedAt, ADR-0012). ISO YYYY-MM-DD
// compares chronologically as text, so there is no Date parsing. `today` is
// injectable for deterministic tests (mirrors date.ts).

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

// isWatched is whether the group has recorded the Night as watched.
export function isWatched(night: Night): boolean {
  return night.watchedAt !== null;
}

// isDue is a Night waiting on "We watched it": dated today or earlier and not
// recorded yet.
export function isDue(night: Night, today: string = todayLocalISO()): boolean {
  return !isWatched(night) && nightTiming(night.scheduledFor, today) !== "upcoming";
}

// UpNextAction is the UpNextCard's primary button: the next thing the group
// has to do for the Night, or null when there is nothing to do yet.
export type UpNextAction = "chooseFilm" | "watched" | null;

// upNextAction picks it: with no film yet, choose the film (whatever the
// date); with a film and the Night due, record it as watched; with a film and
// the Night still ahead, nothing.
export function upNextAction(night: Night, today: string = todayLocalISO()): UpNextAction {
  if (night.movie === null) return "chooseFilm";
  if (isDue(night, today)) return "watched";
  return null;
}

// plannedNights is every Night not yet recorded as watched, soonest first. A
// due Night from an earlier day comes first, so it stays on Tonight until it is
// recorded. Tonight's lineup (lib/tonight.ts) puts its head up next and lists
// its tail as also planned.
export function plannedNights(nights: Night[]): Night[] {
  return nights
    .filter((n) => !isWatched(n))
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}

// watchedNights is the Watched selector: the Nights recorded as watched, in
// the order given. A Night joins it only once it is recorded, whatever its
// date.
export function watchedNights(nights: Night[]): Night[] {
  return nights.filter(isWatched);
}

// nightDates is the calendar-dots selector: the dates that already hold a
// Night. A group has at most one Night per date.
export function nightDates(nights: Night[]): Set<string> {
  return new Set(nights.map((n) => n.scheduledFor));
}

// NightWording is what the screens say about a Night for its timing, so no
// screen reduces the timing to its own yes/no. Tonight's Night reads forward
// (the film hasn't been watched yet); a past Night reads as a record.
export type NightWording = {
  // countdown is null once the Night has passed.
  countdown: string | null;
  pickerTitle: (name: string) => string;
  attendeesSection: (count: number) => string;
  whoSection: string;
  whoHint: string;
  // pickerNote is the line under a Night still waiting on its film, or null
  // for a past Night, which has nothing left to wait for.
  pickerNote: ((first: string) => string) | null;
  // editSub says what "Edit night" changes.
  editSub: string;
  skipLabel: (first: string) => string;
  // A Calendar entry is for a Night still ahead.
  canAddToCalendar: boolean;
};

// nightWording words a Night dated `scheduledFor` (or a plan for that date).
export function nightWording(scheduledFor: string, today: string = todayLocalISO()): NightWording {
  const timing = nightTiming(scheduledFor, today);
  switch (timing) {
    case "upcoming":
      return {
        countdown: countdownLabel(scheduledFor, today),
        pickerTitle: (name) => `${name} picks`,
        attendeesSection: (count) => `Coming · ${count}`,
        whoSection: "Who's coming?",
        whoHint: "Who's planning to come? The next-up member who's in gets the pick.",
        pickerNote: (first) => `${first} can choose now or on the night. Whatever it is, you watch it.`,
        editSub: "Date, time and who's coming",
        skipLabel: (first) => `Skip for now · ${first} can pick later`,
        canAddToCalendar: true,
      };
    case "tonight":
      return {
        countdown: countdownLabel(scheduledFor, today),
        pickerTitle: (name) => `${name} picks`,
        attendeesSection: (count) => `Coming · ${count}`,
        whoSection: "Who's here?",
        whoHint: "Tap who made it. Tonight's pick goes to whoever's next up and here.",
        pickerNote: (first) => `${first} can choose now or later tonight. Whatever it is, you watch it.`,
        editSub: "Date, time and who's coming",
        skipLabel: (first) => `Skip for now · ${first} can pick later`,
        canAddToCalendar: true,
      };
    case "past":
      return {
        countdown: null,
        pickerTitle: (name) => name,
        attendeesSection: (count) => `Who watched · ${count}`,
        whoSection: "Who was there?",
        whoHint: "Tap who made it. The pick goes to whoever was next up and there.",
        pickerNote: null,
        editSub: "Date, time and who watched",
        skipLabel: () => "Skip for now",
        canAddToCalendar: false,
      };
  }
}

// nightMeta is the line above the film on the Night screen: the full date for
// a past Night ("Saturday, Jun 20"), and for one still ahead how far off it is,
// the date and the start time when set ("Tonight · Jun 23 · 8:00 PM").
// `locale` reaches formatStartTime, for deterministic tests.
export function nightMeta(
  scheduledFor: string,
  startTime: string | null,
  today: string = todayLocalISO(),
  locale?: string,
): string {
  if (nightTiming(scheduledFor, today) === "past") {
    return formatWeekdayDate(scheduledFor);
  }
  const parts = [relativeLabel(scheduledFor, today), formatShortDate(scheduledFor)];
  if (startTime !== null) {
    parts.push(formatStartTime(startTime, locale));
  }
  return parts.join(" · ");
}
