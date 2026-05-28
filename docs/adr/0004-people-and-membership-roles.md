# ADR-0004 — Model members and guests as one people table with membership roles

**Status:** Accepted (2026-05-28)

## Context
Guests are common, and repeated guests are common. A plain "guest name" string
cannot accumulate history (their past picks and reviews) and cannot be recognized
across nights.

## Decision
Represent every human as a row in a `users` (people) table. A `memberships` row
links a person to a group with a `role`:
- `core` — part of the rotation; carries a `rotation_position`.
- `guest` — attends and may pick when invited; not in the rotation; never owed a turn.

Picks and reviews reference people uniformly. Record who was present each night in
an `attendances` table (linked to that night's pick), because the turn calculation
needs to know who is in the room.

## Consequences
- Repeated guests are simply recurring people with their own history. Promoting a
  guest to core is a role change, not a data migration.
- Attendance becomes a first-class input to the rotation logic.
- Slightly more setup than a throwaway string, justified by the "repeated guests"
  reality.

---
[← Index](README.md)
