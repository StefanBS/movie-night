# ADR-0006 — Handle core-membership churn by deactivating, seeding, and crediting

**Status:** Accepted (2026-05-28)

## Context
Core membership will change over time — people join and leave. Under a lifetime
least-served ranking ([ADR-0005](0005-least-served-turn-ranking.md)), three problems arise:
- A new member with zero picks looks maximally "behind" and would dominate the
  rotation for a long time.
- A departed member still owns historical picks, reviews, and attendance that must
  remain valid.
- A guest promoted to core should not have their prior guest-night picks
  retroactively count toward their standing.

## Decision
- **Removal = deactivation, never deletion.** `memberships` carries a `status`
  (`active`/`inactive`) and a `left_at` timestamp. The turn ranking considers only
  active members. A deactivated member's history stays intact and
  foreign-key-valid; if they were the most-owed, the ranking simply advances to the
  next active person.
- **Addition = baseline seeding.** `memberships` carries a `baseline_picks` value,
  set at join (and at re-activation) to the current average credited count among
  active core members, and added to the live count in the ranking. This puts
  newcomers and returners on equal footing immediately. The seed is a tunable
  policy: seed to the minimum and they pick sooner, to the maximum and they go to
  the back of the line; the average is the neutral default.
- **"What counts as a turn" is explicit.** Each pick carries an `is_credited` flag.
  Normal core picks are credited; guest nights, free-pick nights, and a promoted
  guest's earlier guest picks are not. The ranking counts only credited picks, so
  role changes never retroactively reshuffle standings.

## Consequences
- Join, leave, return, and guest→core promotion are all handled without
  recomputation or history loss.
- Reactivation reuses the join seeding, preventing a returner's stale low count from
  dominating.
- Requires a uniqueness guarantee for a person's membership within a group, and a
  small amount of seed logic at join time.

---
[← Index](README.md)
