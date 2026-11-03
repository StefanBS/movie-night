# ADR-0013 — A Night can't be recorded as watched more than a day past the UTC date

**Status:** Accepted (2026-11-03). Supersedes [ADR-0012](0012-night-recorded-as-watched.md)'s
consequence that the server doesn't check a Watched Night's date.

## Context
[ADR-0012](0012-night-recorded-as-watched.md) left the server unable to check
a Watched Night's date: `PATCH …/nights/{n}` with `watched: true` checked for
a film but not for the date, so a Night dated next week could be recorded and
go straight to Watched. The app only offers "We watched it" on a due Night,
but the server is the source of truth
([ADR-0003](0003-backend-source-of-truth-letterboxd-csv.md)). It has no group
timezone ([ADR-0010](0010-server-push-reminders.md),
[ADR-0011](0011-night-start-time-wall-clock.md)), and its UTC date can be a
day behind a device's (UTC+14), so `scheduled_for <= CURRENT_DATE` would
reject a real due Night on the evening it happens.

## Decision
- **A lenient bound on the server's UTC date.** A Night can be recorded as
  watched only when its date is no later than the day after the server's
  current UTC date (`recordableAsWatched`). No zone's today is more than a day
  ahead of the UTC date, so a Night dated today passes everywhere. Otherwise:
  `422`, and the edit changes nothing.
- **The same bound holds a Watched Night.** An edit of a Watched Night can't
  move it past the bound (`422`). Moving it within the bound keeps it
  watched, and there's still no un-recording. A Night not yet watched can be
  planned any distance ahead.
- **No client change.** The wire contract is unchanged; the date is the one
  the edit carries, so recording and moving a Night in one edit checks the new
  date.

## Rationale and alternatives
- *The client sends its local date and the server checks against it:*
  rejected. It's exact for that device, but the server would trust a date the
  client picked, and it adds a field to the wire contract.
- *A group timezone:* rejected. It reopens ADR-0010 for this one check.

## Consequences
- In zones ahead of UTC a Night can be recorded up to a day early (one dated
  tomorrow, local time, in UTC+1 and later). That's the same day of tolerance
  ADR-0012's backfill accepted.
- A Watched Night already dated past the bound (possible only before this
  check, and never offered by the client) rejects every edit until its date
  is moved back within the bound.
- The bound uses the API server's clock, not the database's `CURRENT_DATE`.
  Both read UTC here, but a skewed server clock moves the bound with it.

---
[← Index](README.md)
