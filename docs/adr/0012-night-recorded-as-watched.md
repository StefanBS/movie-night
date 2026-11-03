# ADR-0012 — A Night is history only once the group records it as watched

**Status:** Accepted (2026-11-03)

## Context
A Night's state has been a function of its date alone: every Night dated today
or earlier showed on Watched, whether or not anyone watched anything. The
redesigned UpNextCard (design bundle 2026-11-03, `CHANGES-SINCE-LAST-BUNDLE.md`
§3) has a **We watched it** button for a Night that is *due*: dated today or
earlier and not recorded yet. Pressing it "saves the night to Watched and moves
the rotation on". That needs a state the date can't give: a past Night that is
still only planned. The backend has no group timezone
([ADR-0011](0011-night-start-time-wall-clock.md)).

## Decision
- **A Night carries when it was recorded as watched:** `picks.watched_at`,
  `timestamptz`, NULL until recorded. It is exposed through the `nights` view
  and on the wire as `watchedAt` (RFC 3339, UTC) or null.
- **Recording is part of the Night edit.** `PATCH /groups/{g}/nights/{n}` takes
  an optional `watched: true` and an optional `pickerId`, so the flow confirms
  who came, who picked and that they watched it in **one transaction**. Any
  rejected part (a picker who isn't attending, a non-member, a taken date)
  saves nothing.
- **Only a Night with a film can be recorded** (422 otherwise): the button only
  appears once a film is chosen.
- **Recording happens once.** Recording again keeps the first `watched_at`, and
  an edit without `watched` leaves it alone. There is no un-recording for now.
- **Backfill:** the migration records every Night dated before the server's
  `CURRENT_DATE`, so existing history doesn't turn due. With no group timezone,
  a Night dated "yesterday" in some zones may be backfilled a day early; that's
  acceptable for a one-off. Tonight's and future Nights start unrecorded.
- **The rotation is unchanged.** A core pick is still credited when the Night
  is created (served count), and changing the picker still re-derives
  whether it's credited. "Moves the rotation on" means the recorded Night leaves
  Tonight, and the next Night or the next picker takes its place.
- **The client derives the states** (`lib/nightLifecycle.ts`): a Night is *due*
  when it's dated today or earlier and unrecorded; *planned* Nights (Tonight's
  up next and "Also planned") are every unrecorded Night, soonest first, so a
  due Night from an earlier day stays up next until recorded; Watched lists
  recorded Nights only.

## Rationale and alternatives
- *Keep the state date-based:* rejected. Watched would keep filling with
  Nights nobody confirmed, and the card couldn't tell a due Night from history.
- *Credit the pick when it's recorded rather than when the Night is created:*
  rejected for now. With several Nights planned it would reorder the queue
  every time one is recorded, and it changes ADR-0005's served count. If
  that's wanted, it needs its own ADR.
- *A separate `POST …/watched` endpoint:* rejected. Confirming attendees and
  recording would be two requests, and a failure between them would leave the
  Night half-saved.
- *A boolean instead of a timestamp:* rejected. The timestamp costs nothing
  and records when the Night was confirmed.

## Consequences
- A Night that's never recorded stays up next on Tonight indefinitely, ahead of
  later Nights, until someone records it (or deletes it).
- The server doesn't check a recorded Night's date: without a group timezone
  it can't tell whether a Night is due. The client only offers "We watched it"
  on a due Night. A recorded Night whose date is later moved forward stays
  recorded.
- Backfilled Nights carry the migration's time as `watched_at`, not a time on
  their own date.
- The Night screen's wording stays date-based: a due past Night reads as "Who
  was there?". The record flow and the card's buttons are separate changes.
- The dev seed records its past Nights explicitly, because it runs after the
  migrations and misses the backfill.

---
[← Index](README.md)
