# ADR-0010 — Reminders are server push, computed each minute and sent at most once

**Status:** Accepted (2026-10-27)

## Context
The handoff specifies reminders for an upcoming Night (night before 6 PM, morning
of 9 AM, 2 h before), an audience ("Everyone coming" / "Just the picker"), and a
personal nudge the picker always gets — and suggests local notifications via
`expo-notifications`. A Night is a date with no time of day, and the backend has
no group timezone ([ADR-0008](0008-night-always-has-a-picker.md)). Identity now
exists ([ADR-0009](0009-claimed-identity-device-tokens.md)), so the backend
knows which person each device is.

## Decision
- **Server push, not local notifications.** Each device record carries an Expo
  push token, registered through a device-token-authenticated call re-sent on
  every launch. The backend sends through Expo's push service. Releasing the
  identity deletes the device and its token; a `DeviceNotRegistered` receipt
  clears the token.
- **Settings live on the Night; muting lives on the person.** Which slots are on
  and the audience are shared Night settings, saved with the Night edit
  (defaults: night-before and morning-of on, audience everyone coming). Each
  identity has one switch that mutes all reminders and nudges to them.
- **Slots are wall-clock times on the recipient's device.** Each device reports
  its IANA timezone with its push token; "6 PM the night before" is 6 PM there.
- **The picker's nudge** goes out at the night-before slot whatever the Night's
  settings, and replaces the group reminder for the picker in that slot.
- **A scheduler loop in the API process** wakes every minute and computes due
  (Night, person, slot) reminders from the current Nights and settings — no
  pre-scheduled jobs, so editing, re-dating or deleting a Night needs no
  cleanup. A sent-log with a unique (night, person, slot) key is written
  **before** sending: delivery is at most once, never repeated even after edits.
  A slot is due only within 15 minutes of its time; missed slots are skipped,
  never sent late.
- **"2 hours before" is dropped** until a Night has a start time. *(Brought
  back by [ADR-0011](0011-night-start-time-wall-clock.md).)*

## Rationale and alternatives
- *Local notifications (the handoff's suggestion):* rejected — a phone only
  schedules them after opening the app since the Night was created or changed,
  and one phone cannot target others ("Just the picker").
- *A group timezone:* rejected — a new setting to keep right, when the device
  already knows its own zone.
- *A job queue of scheduled sends:* rejected — every Night edit would need to
  cancel and reschedule jobs; computing from current state each minute is
  self-correcting at this scale.
- *Send then log (at least once):* rejected — a duplicate reminder is worse than
  an occasional lost one for a friend group.

## Consequences
- Reminders only fire while the backend is running; until it is hosted, that is
  the dev machine.
- Android delivery needs FCM credentials configured through EAS (a one-time
  manual setup), and `expo-notifications` is a native dependency: the dev client
  must be rebuilt.
- Adding a Night start time can bring back a
  "hours before" slot without changing this model.

---
[← Index](README.md)
