# Membership Churn — Design

**Date:** 2026-06-05
**Status:** Approved (brainstorm)
**ADRs:** [ADR-0006](../../adr/0006-membership-churn-handling.md) (churn), [ADR-0005](../../adr/0005-least-served-turn-ranking.md) (ranking), [ADR-0004](../../adr/0004-people-and-membership-roles.md) (people/roles)

## Goal

Add the **write path** for core-membership churn so the rotation stays fair as
people come and go. ADR-0006's four events are all covered: **join**, **leave**,
**return**, and **guest→core promotion**. Each is exposed as its own endpoint and
wired to a new mobile **manage-members** screen.

The **read path is already churn-aware** — `internal/db/query/turn.sql` adds
`baseline_picks`, filters `status = 'active' AND role = 'core'`, and the schema
already carries `status`, `baseline_picks`, `left_at`, `rotation_position`. So this
slice is purely additive: new write endpoints, an extended members read, a seed
guest, and the mobile screen. **No migration is required.**

## The unifying rule

A membership is **"in the rotation" iff `status = 'active' AND role = 'core'`.**

- Three events **enter** the rotation: join, return, promote.
- One event **leaves** the rotation: deactivate.

Entering the rotation triggers **baseline seeding**. Leaving stamps `left_at`.
Every churn operation is an instance of this one rule.

## Seeding (the shared, pure helper)

When a membership crosses **into** the rotation, seed its baseline so its *total*
served-count lands at the current group average:

```
baseline_picks = max(0, round(avg) − existingCreditedPicks)
```

where `avg` = the average served-count `(baseline_picks + credited_count)` over the
**currently active core members**. Because the entrant is not active-core at the
moment of seeding, they are naturally excluded from `avg` in all three cases (a
fresh joiner doesn't exist yet; a returner is `inactive`; a promotee is a `guest`).

- **Fresh joiner** (0 prior credited picks) → `baseline = round(avg)` → total = avg.
- **Returner / promotee** with prior credited picks → baseline is reduced by those
  picks so the *total* still equals avg. This delivers ADR-0006's "equal footing"
  goal, which the ADR's literal "baseline = avg" wording fails for anyone with
  history (it would double-count them).

**Rounding:** `avg` is computed as a float and rounded to the nearest integer
(ties away from zero, i.e. Go's `math.Round`). **Empty active-core set** → `avg`
coalesces to `0` → `baseline = 0`.

This computation is a pure function, unit-tested in isolation, called by the three
entering operations.

## Idempotency (why there is no 409)

Each endpoint expresses a **desired end-state** and **seeds only when the membership
actually crosses into the rotation** (was-not-active-core → is-active-core). If the
membership is already in the target state, the call is a **no-op that returns `200`
with the current member**.

This is a *correctness* requirement, not just ergonomics: re-seeding is **not**
idempotent in effect (a second promote would recompute `avg` — now including the
already-promoted member — and corrupt the standings). Gating the seed on
"crossing into the rotation" makes repeated calls safe, so double-taps, network
retries, and concurrent admins are all harmless.

**Error paths are limited to:**

- `404` — no membership for that `userId` in the group (a genuinely wrong target).
- `400` — malformed group/user UUID, or a malformed/empty body where one is required.

There is no `409`.

## Backend — endpoints

All under the existing stdlib `net/http` method-pattern mux, registered in
`main.go`. Handlers mirror `picks.go`: pure validation/seed helpers + a small
store interface (one method per query), no mocks.

| Event | Endpoint | Effect |
|-------|----------|--------|
| Join | `POST /groups/{groupId}/members` | Create a `user` from the body `{name}`, insert an `active`/`core` membership, **seed**, `rotation_position = max+1`. → `201` |
| Leave | `POST /groups/{groupId}/members/{userId}/deactivate` | Ensure `status = inactive`, stamp `left_at = now`. Already inactive → no-op. → `200` |
| Return | `POST /groups/{groupId}/members/{userId}/reactivate` | Ensure `status = active`, clear `left_at`; **seed iff this crosses into the rotation**. Already active → no-op (no re-seed). → `200` |
| Promote | `POST /groups/{groupId}/members/{userId}/promote` | Ensure `role = core, status = active`, clear `left_at`, `rotation_position = max+1`; **seed iff entering**. Already active-core → no-op (no re-seed). → `200` |

**Request/response shapes**

- **Join body:** `{ "name": string }` — non-empty after trim, else `400`.
- **Transition endpoints:** no body.
- **Response (all four):** the resulting member, matching the `GET /members` entry
  shape: `{ "id": userId, "name", "role", "status" }`. Join returns it with `201`;
  transitions with `200`.

**Store interface (sketch)** — the real `*db.Queries` satisfies it (same pattern as
`turnStore`/`pickStore`):

```go
type memberStore interface {
    CreateUser(ctx, name) (db.User, error)
    InsertMembership(ctx, InsertMembershipParams) (db.Membership, error)
    GetMembership(ctx, groupID, userID) (db.Membership, error)        // 404 source
    SetMembershipStatus(ctx, ...) (db.Membership, error)              // deactivate/reactivate
    PromoteMembership(ctx, ...) (db.Membership, error)                // role+status+position+baseline
    AverageServedCount(ctx, groupID) (float64, error)                 // seed input
    MaxRotationPosition(ctx, groupID) (int32, error)                  // rotation_position = max+1
    MemberCreditedCount(ctx, groupID, userID) (int32, error)          // existingCreditedPicks for seed
}
```

(Exact query split is a plan-time detail; the design constraint is: pure seed helper
+ thin store, no mocks, FK/`23503`-style errors mapped where they can occur.)

## Backend — read path for the manage screen

`GET /groups/{groupId}/members` currently returns **active-only** and omits status.
The manage screen needs to see everyone. Extend it:

- Return **all memberships** in the group (active + inactive, core + guest).
- Each entry gains a **`status`** field (`"active" | "inactive"`).
- **Order:** active core (by `rotation_position`), then active guests, then inactive
  (by name). This keeps the turn-relevant people on top.

This replaces the active-only filter in `ListGroupMembers` (or adds a sibling query;
plan-time choice). The `GET /turn` ranking is untouched.

## Data / seed

No migration. `seed.sql` gains **one guest user** so the promote path is
demonstrable end-to-end:

```sql
-- user
('a0000000-0000-0000-0000-000000000006', 'Frankie')
-- membership: active guest, baseline 0, rotation_position 6
('b0000000-...006', '1111...111', 'a0...006', 'guest', 'active', 0, 6)
```

The shared group UUID `11111111-1111-1111-1111-111111111111` is unchanged.

## Mobile

### `lib/members.ts` (extend the kept-on-purpose client)

- `Member` gains `status: "active" | "inactive"`.
- Add four write functions, each a thin POST + response-validate via a shared
  `parseMember`, mirroring `lib/picks.ts`:
  - `addMember(baseUrl, groupId, name, signal?) → Member`
  - `deactivateMember(baseUrl, groupId, userId, signal?) → Member`
  - `reactivateMember(baseUrl, groupId, userId, signal?) → Member`
  - `promoteMember(baseUrl, groupId, userId, signal?) → Member`
- Each throws `request failed: <status>` on non-2xx.

### Navigation → expo-router (per SDK 54 docs)

Migrate from the custom `index.ts` + `App.tsx` entry to file-based routing
(verified against <https://docs.expo.dev/versions/v54.0.0/> per `mobile/AGENTS.md`):

1. `npx expo install expo-router expo-linking` (safe-area-context, screens,
   constants, status-bar already present).
2. `package.json` `"main": "expo-router/entry"` (replaces `index.ts`, which is
   deleted).
3. `app.json`: add `"scheme": "movienight"`, `"web": { "bundler": "metro" }`, and
   `"experiments": { "typedRoutes": true }`.
4. Add `babel.config.js` exporting `presets: ['babel-preset-expo']` (none exists
   today; `babel-preset-expo` carries the router transform).
5. App directory:
   ```
   app/
     _layout.tsx     # <Stack> inside SafeAreaProvider; header titles
     index.tsx       # today's turn screen (moved from App.tsx), + a header link to /manage
     manage.tsx      # new manage-members screen
   ```
   `App.tsx` content moves into `app/index.tsx`; `App.tsx` and `index.ts` are removed.

### `app/manage.tsx`

- On focus, `fetchMembers` (now returns everyone with status).
- Renders members with role/status badges (active core, active guest, inactive).
- **Add member:** a `TextInput` + button → `addMember(name)` → clear input → refetch.
- **Per-row actions** (shown by current state):
  - active core → *Deactivate*, (already core, so no Promote)
  - active guest → *Promote*, *Deactivate*
  - inactive → *Reactivate*
- Each action calls the client then refetches the list. In-flight/disabled handling
  mirrors the record-pick screen (a single in-flight op at a time; failures surface
  in an error line).

## Testing

**Backend**

- *Unit (pure, table-driven, no mocks):*
  - seed math: fresh joiner → `round(avg)`; returner/promotee with history →
    `max(0, round(avg) − credited)`; empty active-core → `0`; rounding/ties.
  - request validation: empty/whitespace name → error; malformed UUIDs.
- *Integration (testcontainers, real Postgres):*
  - **join** a fresh member → `201`; `GET /turn` shows them at the average.
  - **leave** the current leader → they drop out of `/turn`; ranking advances.
  - **return** a deactivated member → re-seeded to average, not double-counted;
    a second `reactivate` is a no-op (baseline unchanged).
  - **promote** the seeded guest → enters `/turn` at the average; a second
    `promote` is a no-op (baseline unchanged). Their prior **uncredited** guest
    picks never count.
  - `404` for an unknown `userId`; `400` for a malformed UUID / empty join name.

**Mobile**

- `lib/members` unit tests for `parseMember` (incl. `status`) and rejection of bad
  shapes; integration tests (real local HTTP server, real `fetch`) for the four
  write ops — correct method/path/body and parsed result, and throw on non-2xx.

## Out of scope (deferred)

- Auth / permissions (incl. an admin axis) — backlog "Authentication and account
  model"; the four ops are kept single-purpose so an admin axis is additive later.
- Creating **guests** via the API (guests arrive via a future attendance/invite
  flow); this slice seeds one guest for the promote demo.
- The baseline-seeding *policy* knob (min/avg/max) from ADR-0006 — we hardcode the
  **average** (the ADR's neutral default); making it tunable is a later decision.
