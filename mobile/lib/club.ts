import { firstName } from "./avatar";
import { formatMonthYear } from "./date";
import { capitalize } from "./text";
import type { Member } from "./members";
import { watchedNights } from "./nightLifecycle";
import type { Night } from "./nights";
import type { TurnMember } from "./turn";

// The Club screen's three sections. `inRotation` is the turn ranking as-is
// (active core only, already ordered); guests and inactive come from the full
// roster, which the turn endpoint omits.
export type ClubSections = {
  inRotation: TurnMember[];
  guests: Member[];
  inactive: Member[];
};

// buildClubSections shapes the roster + turn ranking into the Club's sections.
export function buildClubSections(
  members: Member[],
  turn: TurnMember[],
): ClubSections {
  return {
    inRotation: turn,
    guests: members.filter((m) => m.role === "guest" && m.status === "active"),
    inactive: members.filter((m) => m.status === "inactive"),
  };
}

// clubSummary is the tab bar's mono sub: active-member count · rotation size.
export function clubSummary(members: Member[], turn: TurnMember[]): string {
  const active = members.filter((m) => m.status === "active").length;
  const noun = active === 1 ? "member" : "members";
  return `${active} ${noun} · ${turn.length} in rotation`;
}

// MemberProfile is one member plus their rotation standing, if any: the turn
// entry (stats) and 1-based rank are null for guests and inactive members,
// who are not in the rotation.
export type MemberProfile = {
  member: Member;
  turn: TurnMember | null;
  rank: number | null;
};

// memberProfile looks a member up by id, attaching their turn entry and rank
// when they are in the rotation. Returns null if no member matches.
export function memberProfile(
  members: Member[],
  turn: TurnMember[],
  id: string,
): MemberProfile | null {
  const member = members.find((m) => m.id === id);
  if (member === undefined) {
    return null;
  }
  const index = turn.findIndex((t) => t.id === id);
  if (index === -1) {
    return { member, turn: null, rank: null };
  }
  return { member, turn: turn[index], rank: index + 1 };
}

// ordinal renders a 1-based place in line: "1st", "2nd", "3rd", "4th", with
// the teens ("11th", "12th", "13th") as the exception.
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

// memberSince is the line under a member's first name: their full name, role
// and the month they joined ("Ada Lovelace · core since Jan 2024"). A one-word
// name is already the heading, so it isn't repeated ("Core since Jan 2024").
export function memberSince(member: Member): string {
  const since = `${member.role} since ${formatMonthYear(member.joinedOn)}`;
  if (member.name.trim() === firstName(member.name)) {
    return capitalize(since);
  }
  return `${member.name} · ${since}`;
}

// memberPicks is a member's picks list: the Nights they picked that the group
// has recorded as watched (as in Watched), newest first.
export function memberPicks(nights: Night[], memberId: string): Night[] {
  return watchedNights(nights)
    .filter((n) => n.pickerId === memberId)
    .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
}

// noPicksLine is the picks list's empty state. It says where the member stands
// in the rotation when they're in it; guests and inactive members get the
// plain line.
export function noPicksLine(name: string, rank: number | null): string {
  const first = firstName(name);
  if (rank === 1) {
    return `No picks yet. ${first} is next up, so the first one is coming.`;
  }
  if (rank !== null) {
    return `No picks yet. ${first} is ${ordinal(rank)} in line.`;
  }
  return "No picks yet.";
}
