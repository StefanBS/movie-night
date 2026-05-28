# ADR-0005 — Determine whose turn it is with a "least-served" ranking

**Status:** Accepted (2026-05-28)

## Context
Turns rotate, but typically only 3–4 of the 5 core members attend a given night. A
member who cannot attend, or cannot decide on a film, should have their turn
*deferred*, not *forfeited*. Two naive approaches fall short:
- A positional round-robin ("advance to the next position") forfeits a turn whenever
  someone is absent.
- An explicit cycle/credit model preserves turns but adds bookkeeping and a real
  edge case: a night where everyone present has already picked this cycle while the
  still-owed members are absent. Someone must still pick.

## Decision
Determine the picker with a **least-served ranking**. Among core members who are
active and present tonight, choose the one with the fewest *credited* picks; break
ties by who picked least recently, then by a stable seed order. There are no explicit
cycles or credits.

## Rationale and alternatives
- *Positional round-robin:* rejected — forfeits turns on absence.
- *Cycle + credits:* workable but requires cycle bookkeeping and an explicit policy
  for the all-owed-absent edge case.
- *Least-served (chosen):* dissolves that edge case (there is always a most-behind
  present member, so there is always an answer), and makes deferral automatic — an
  absent member's count does not move, so they rise to the top and pick the moment
  they return. The turn logic reduces to a single ranking query.

## Consequences
- No special cases; deferral is implicit; the logic is one query that is easy to
  reason about and hard to get subtly wrong.
- A guest night and a "nobody owed is present" night are the same thing: no one's
  standing changes (see also [ADR-0006](0006-membership-churn-handling.md) on credited picks).
- It optimizes *lifetime* fairness, not *per-round* fairness. After a long absence, a
  member can pick several weeks in a row to catch up. Given the group's stated value
  ("don't lose your pick"), this is acceptable and arguably correct. If it ever feels
  wrong, add a guard: prevent the same person from picking twice in a row while
  another present member has not picked since their last turn.

## Notes
- `rotation_position` survives only as the seed order and final tiebreak.
- The "present tonight" set comes from attendance ([ADR-0004](0004-people-and-membership-roles.md)).

---
[← Index](README.md)
