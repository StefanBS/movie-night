# ADR-0009 — An install claims its identity from the roster and holds a device token

**Status:** Accepted (2026-10-27)

## Context
The app had no notion of who was using a phone: the mobile client called a
hardcoded group with no "me", and every API route was open. Member-specific
features — the picker's "it's your turn" nudge vs the group heads-up, personal
notification settings, "Leave group" — need a stable person to target, and
server push needs something durable to attach device tokens to. The users are a
small group of friends; the app has no email, passwords or accounts.

## Decision
- **Claim from the roster.** On first launch, once the group is known and before
  the tabs, the app asks "who are you?" and the user taps their name. Anyone with
  an active membership — core member or guest — can be claimed. "I'm not on the
  list" adds the person as a **guest** via the existing join flow and claims
  them; becoming core stays a deliberate promotion.
- **The claim is honor-system; the device token proves continuity.** Claiming
  creates a server-side device record and returns a random 32-byte bearer token.
  The server stores only its SHA-256 hash (`devices`: user, token hash,
  created/last-seen). The app keeps the token in `expo-secure-store`
  (`localStorage` on web). The token does not prove the claim was honest; it
  proves later requests come from the device that made it.
- **The identity is the person, not a membership.** One person may have many
  devices; a device has exactly one identity at a time. An identity stays bound
  when its membership goes inactive; group-specific features check the
  membership when they run.
- **Release.** "Not you? Switch" in Settings deletes the device record (revoking
  the token) and returns to "who are you?". A reinstall simply claims again; the
  orphaned record is left for later cleanup.
- **Only identity-acting calls require the token** (claim, who-am-I, release,
  and later push/preferences). Existing group, night and member routes stay
  unauthenticated for now.

## Rationale and alternatives
- *Honor-system pick with no token:* rejected — nothing durable or unforgeable
  to attach push tokens and preferences to.
- *Invite code before claiming:* deferred to group onboarding, where it gates
  joining a group (and closes the open-API gap once the backend is hosted).
- *Real accounts (magic link, Google/Apple sign-in):* rejected for now — email
  or OAuth setup and recovery flows are far beyond what a friend group needs,
  and the misclaim risk is low-stakes and fixed by Release.
- *Authenticate every route now:* rejected — with an honor-system claim it adds
  friction without real security; it belongs with the invite-code gate.

## Consequences
- Anyone who can see a group's roster can claim any person in it. Strengthening
  that later means putting proof (a per-person claim code, Apple/Google sign-in,
  or an email link) in front of the claim — the claim endpoint is the single
  place tokens are issued, so the device-token model is unchanged. A real
  guarantee also needs the token on the routes left open here, and someone must
  vouch for a person's first link (a per-person code does this most simply).
- `expo-secure-store` is a native dependency: the dev client must be rebuilt.
- Personalising screens (Home's "it's your turn", nudges) builds on this in
  follow-up work.

---
[← Index](README.md)
