import { plannedNights } from "./nightLifecycle";
import type { Night } from "./nights";
import type { TurnMember } from "./turn";

// How many members Tonight lists on deck after the next picker.
const ON_DECK = 3;

// TonightLineup is what the Tonight tab shows, as one value:
// - planned: the soonest planned Night is up next (a due Night from an earlier
//   day first, until it's recorded), the rest are also planned, and onDeck is
//   who picks after that Night's own picker;
// - unplanned: no Night is planned, so the head of the turn ranking is next
//   up and onDeck is who follows them;
// - empty: nothing planned and no one in the rotation.
export type TonightLineup =
  | { kind: "planned"; night: Night; alsoPlanned: Night[]; onDeck: TurnMember[] }
  | { kind: "unplanned"; picker: TurnMember; onDeck: TurnMember[] }
  | { kind: "empty" };

// tonightLineup builds Tonight from the turn ranking and the group's Nights.
// A planned Night wins over an empty ranking, so a guest's Night still shows.
// The next picker is the planned Night's picker, else the ranking's head. A
// planned Night's picker is already counted and has sunk in the ranking
// (often to the bottom), so on deck is the ranking without them, not the
// ranking past its head; that also holds for a picker chosen out of turn or
// not in the rotation. Pure.
export function tonightLineup(ranking: TurnMember[], nights: Night[]): TonightLineup {
  const [night, ...alsoPlanned] = plannedNights(nights);
  if (night !== undefined) {
    return { kind: "planned", night, alsoPlanned, onDeck: after(ranking, night.pickerId) };
  }
  const picker = ranking[0];
  if (picker === undefined) {
    return { kind: "empty" };
  }
  return { kind: "unplanned", picker, onDeck: after(ranking, picker.id) };
}

function after(ranking: TurnMember[], pickerId: string): TurnMember[] {
  return ranking.filter((m) => m.id !== pickerId).slice(0, ON_DECK);
}
