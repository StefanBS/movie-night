# ADR-0008 — A Night always has a picker; unfinished plans live on the client

**Status:** Accepted (2026-10-27)

## Context
The night wizard used to persist a Night the moment a date was chosen, with no
picker yet (an "open" night), then add attendees one write at a time and set the
picker later. That intermediate state needed its own machinery — an
at-most-one-open-night index, server-side resume of the open night (which ignored
a newly requested date), and race recovery on create — and it leaked: open nights
were excluded from the nights list, so they were invisible on Up next, the
calendar and History, yet still blocked creating another night. The backend
called a night "recorded" once it had a picker while the mobile app called it
"done" once it had a film, so the two disagreed about the same night.

## Decision
- **Every persisted Night has a picker.** A night is created in one request
  carrying its date, attendees and picker; the picker must be an attendee, and
  removing the picker from the attendees is rejected.
- **Unfinished plans live on the client.** The wizard holds the date and
  attendees as a local draft and shows the live order through the group turn
  ranking over the draft's attendees. When the ranking is empty (a guest-only
  night), the user chooses the picker explicitly.
- **At most one Night per group per date.**
- **The film is an attribute, not a state.** Attaching it later
  ([ADR-0007](0007-tmdb-proxy-source-of-truth.md)) never changes whether a night
  counts. Date-relative states (upcoming / tonight / past) are derived on the
  client, since the backend has no group timezone.

## Rationale and alternatives
- *Keep open nights and make them visible:* rejected — keeps the resume and
  race machinery and a state every reader must handle, to preserve something
  cheap to lose.
- *No open nights (chosen):* deletes a whole state instead of managing it. The
  cost is that a half-finished wizard is not saved if the app is killed — a few
  taps of input.

## Consequences
- `picker_id` is required; the open-night index, the current-night endpoint and
  server-side resume are removed. Existing nights always open on the Night view.
- This refines the "planned first, attached later" wording in
  [ADR-0004](0004-people-and-membership-roles.md) and ADR-0007: a night is
  planned with its picker; only the film attaches later.

---
[← Index](README.md)
