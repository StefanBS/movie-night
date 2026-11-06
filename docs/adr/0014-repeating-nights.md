# ADR-0014 — A repeating Night carries its rule and opens the next when recorded or cancelled

**Status:** Accepted (2026-11-03)

## Context
The design system sets a repeat in Edit night › Repeat ("Doesn't repeat",
"Every week", "Every 2 weeks", "Every month" on e.g. the third Friday), and
says the rotation "rolls forward each time, so the next picker is always
ready". Issue #180 proposed storing the rule on the open night, but open nights
are gone ([ADR-0008](0008-night-always-has-a-picker.md)): every Night has a
picker, and a group can plan several Nights, one per date. Each Night's picker
is credited when it's created ([ADR-0012](0012-night-recorded-as-watched.md)).

## Decision
- **The rule rides on one Night at a time.** `picks` gains nullable
  `repeat_freq` (`weekly` | `monthly`), `repeat_interval_weeks` (1 or 2) and
  `repeat_week_of_month` (1–4, or -1 for the last), kept consistent by a CHECK
  and exposed through the `full_nights` view. On the wire it is `repeat`: `null`,
  `{"freq":"weekly","intervalWeeks":1|2}` or `{"freq":"monthly","week":n}`.
  The weekday is always the Night's own.
- **Monthly stores its week.** It is the Nth weekday of the month, taken from
  the date when the repeat is set; a 5th weekday becomes the *last*, which
  every month has. Storing the week, rather than deriving it from each date,
  keeps a "last Friday" that falls on a 4th Friday from turning into "fourth
  Friday" next month. The server rejects a week that doesn't match the date
  (`400`).
- **Recording moves the series on.** When a repeating Night is recorded as
  watched, the same transaction opens the next Night: the next date by the
  rule, the same start time, reminders, attendees and repeat, no film, and the
  picker who leads the turn ranking over those attendees (or the same picker
  when none of them is in the rotation). The recorded Night's rule is cleared,
  so the series lives on exactly one Night. A Watched Night can't be given a
  repeat (`422`).
- **Cancelling moves the series on too.** Deleting a repeating Night skips
  that date: the next Night opens as above, ranked without the cancelled pick,
  so its picker keeps the turn they didn't get. "Doesn't repeat" is how a
  series ends.
- **The next date** is the first occurrence after the Night's date that is on
  or after the server's UTC date, so a Night recorded late doesn't open one
  that is already past.
- **A taken date joins the series.** If a planned Night already holds the next
  date, it takes over the rule (keeping its own, if it repeats) and nothing new
  is created. A Watched Night there is passed over for the following date.
- **Future dates are projections.** The Repeat screen previews the next dates
  on the client (`lib/repeat.ts`); they aren't stored.

## Rationale and alternatives
- *Create the future Nights ahead of time:* rejected. Each would credit its
  picker at creation, so a series would book the rotation weeks ahead, and
  editing the rule would mean rewriting rows.
- *A separate series table:* rejected for now. One rule on one Night needs no
  joins or orphan handling, and a series has nothing else to hold yet.
- *Roll forward when the date passes:* rejected. The server has no group
  timezone ([ADR-0011](0011-night-start-time-wall-clock.md)), and a due Night
  stays up next until it's recorded (ADR-0012).
- *End the series on cancel:* rejected. One skipped Friday would end the
  cadence.

## Consequences
- A repeating Night that is never recorded or cancelled holds the series, so
  no further Night appears; it stays up next as ADR-0012 describes.
- The reminder loop needs no change: the next Night is an ordinary row.
- Adding the whole series to the device calendar is a follow-up.

---
[← Index](README.md)
