# ADR-0011 — A Night's start time is a zone-less wall-clock time, read on each device

**Status:** Accepted (2026-10-28)

## Context
A Night is a date with no time of day. The Calendar entry
([#145](https://github.com/StefanBS/movie-night/pull/145)) fills in a fixed
7:30 PM that is stored nowhere, and [ADR-0010](0010-server-push-reminders.md)
dropped the handoff's "2 hours before" reminder until a Night has a start time.
The backend has no group timezone; reminder slots are wall-clock times on each
recipient's device (ADR-0010).

## Decision
- **A Night may carry a start time: a time of day with no zone** (whole
  minutes), set per Night. Each device reads it on its own clock, exactly like
  ADR-0010's slots. It is optional; existing Nights get none, and nothing is
  back-filled.
- **No group default.** Every Night carries its own start time, or none.
- **A Night's state stays date-based.** Upcoming, tonight and past — and the
  day countdown — ignore the start time.
- **The Calendar entry starts at the start time** when there is one, otherwise
  at 7:30 PM, and runs 3 hours. No end time is stored.
- **"2 hours before" returns** as a third reminder slot: a per-Night setting,
  on by default, that fires only on Nights with a start time, at start time
  minus 2 hours on the recipient's device. The scheduler and sent-log model of
  ADR-0010 are unchanged, including at-most-once and never-late delivery. The
  picker's nudge stays at the night-before slot. Early starts get no special
  case: each slot fires at its own computed time.

## Rationale and alternatives
- *An instant (`timestamptz`):* rejected — saving one needs a timezone the
  backend doesn't have (ADR-0010 rejected a group timezone), and it would make
  a Night's time behave differently from its reminder slots.
- *A group default start time:* rejected for now — a new setting to keep right
  when each Night can carry its own; with no recurring Nights it would only
  save typing.
- *Required start time, back-filled to 7:30 PM:* rejected — it would invent a
  time nobody chose.

## Consequences
- A member in another timezone than the group sees the start time on their
  own clock, the same trade-off reminders already accept.
- A start time just after midnight puts the 2-hours-before slot on the previous
  day, so the scheduler's candidate date range must cover it.
- Setting the time uses the OS time picker
  (`@react-native-community/datetimepicker`), a native dependency: the dev
  client must be rebuilt.

---
[← Index](README.md)
