import type { Member } from "./members";
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
