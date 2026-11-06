import {
  countdownLabel,
  daysUntil,
  formatShortDate,
  formatStartTime,
  formatWeekdayDate,
  formatWeekdayDayMonth,
  relativeLabel,
  todayLocalISO,
} from "./date";
import type { Night } from "./nights";
import { formatRepeatShort, type Repeat } from "./repeat";
import { capitalize } from "./text";

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

// NightAction is a secondary action in the Night's ⋯ sheet.
export type NightAction = "changeFilm" | "edit" | "addToCalendar" | "clearFilm";

// nightActions picks the ⋯ sheet's actions, in display order. Edit is always
// there. Change film needs a film; Clear film also needs the Night unwatched,
// since a Watched Night keeps its film. Add to calendar is for a Night still
// ahead (nightWording's canAddToCalendar), and never on web, where there is no
// OS calendar form. Whether it then asks "whole series or just this night" is
// calendarRecurrence's call (lib/calendarEntry.ts).
export function nightActions(night: Night, today: string, { web }: { web: boolean }): NightAction[] {
  const hasFilm = night.movie !== null;
  const actions: NightAction[] = [];
  if (hasFilm) actions.push("changeFilm");
  actions.push("edit");
  if (nightWording(night.scheduledFor, today).canAddToCalendar && !web) actions.push("addToCalendar");
  if (hasFilm && !isWatched(night)) actions.push("clearFilm");
  return actions;
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

// NightLineParts picks what a Night's "when" line says. Every part is opt-in
// but the start time, which shows whenever it is set.
export type NightLineParts = {
  // countdown says how far off the Night is: "label" leads with "tonight" /
  // "in 3 days" while it is still ahead; "relative" leads with "Tonight" /
  // "This Thursday", or for a past Night is the whole line, its full date (a
  // record, never the time); "trail" ends the date and time with "in 4 days",
  // only for a Night after today.
  countdown?: "label" | "relative" | "trail";
  // date is "long" ("Friday, Jun 19"), "short" ("Jun 19") or "compact"
  // ("Fri 19 Jun"). Left out when the relative countdown already is the date.
  date?: "long" | "short" | "compact";
  // repeat adds a repeating Night's cadence ("Weekly").
  repeat?: boolean;
  // picker is the picker's first name, worded for the Night's timing
  // ("Tomas picks"; just "Tomas" once past).
  picker?: string;
};

export type NightWhen = { scheduledFor: string; startTime: string | null; repeat?: Repeat | null };

// nightLineParts is a Night's "when" line as parts, in a fixed order: the
// leading countdown, the date, the start time, the trailing countdown, the
// repeat, the picker. For a caller that styles one part on its own.
// `locale` reaches formatStartTime, for deterministic tests.
export function nightLineParts(
  night: NightWhen,
  parts: NightLineParts,
  today: string = todayLocalISO(),
  locale?: string,
): string[] {
  const { scheduledFor, startTime } = night;
  const timing = nightTiming(scheduledFor, today);
  if (parts.countdown === "relative" && timing === "past") {
    return [formatWeekdayDate(scheduledFor)];
  }
  const out: string[] = [];
  let dateShown = false;
  if (parts.countdown === "label" && timing !== "past") {
    out.push(countdownLabel(scheduledFor, today));
  } else if (parts.countdown === "relative") {
    const relative = relativeLabel(scheduledFor, today);
    dateShown = relative === formatWeekdayDate(scheduledFor);
    out.push(relative);
  }
  if (parts.date !== undefined && !dateShown) {
    out.push(DATE_FORMATS[parts.date](scheduledFor));
  }
  if (startTime !== null) {
    out.push(formatStartTime(startTime, locale));
  }
  if (parts.countdown === "trail" && timing === "upcoming") {
    out.push(countdownLabel(scheduledFor, today));
  }
  if (parts.repeat === true && night.repeat != null) {
    out.push(formatRepeatShort(night.repeat));
  }
  if (parts.picker !== undefined) {
    out.push(nightWording(scheduledFor, today).pickerTitle(parts.picker));
  }
  return out;
}

const DATE_FORMATS = {
  long: formatWeekdayDate,
  short: formatShortDate,
  compact: formatWeekdayDayMonth,
} satisfies Record<NonNullable<NightLineParts["date"]>, (iso: string) => string>;

// nightLine is the one formatter for a Night's "when" line: nightLineParts
// joined with " · ", capitalized so a lowercase countdown can start it
// ("In 3 days · Thursday, Jun 25 · 8:00 PM · Weekly").
export function nightLine(
  night: NightWhen,
  parts: NightLineParts,
  today: string = todayLocalISO(),
  locale?: string,
): string {
  return capitalize(nightLineParts(night, parts, today, locale).join(" · "));
}
