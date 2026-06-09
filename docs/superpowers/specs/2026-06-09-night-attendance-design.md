# Night Attendance & Pick Order — Design

**Date:** 2026-06-09
**Status:** Approved (brainstorm)
**ADRs:** [ADR-0005](../../adr/0005-least-served-turn-ranking.md) (least-served ranking), [ADR-0004](../../adr/0004-people-and-membership-roles.md) (people/roles/guests), [ADR-0006](../../adr/0006-membership-churn-handling.md) (credited picks)

## Goal

Record **who is attending a given movie night** and compute the **pick order**
(least-served ranking) over *those attendees*, replacing the manually-typed
`?present=` query param the `/turn` endpoint takes today with a persisted
attendee list.

Real-world flow (attendance is decided **off-app** — in person / WhatsApp): a few
days ahead the group fixes a date and an attendee list; that list can still change
right up to the night; then the pick order tells them whose turn it is. The #1
person may **skip**, in which case it falls to #2 — handled simply by returning the
*whole* ordered list. A **guest** can also be handed the pick (not required).

This is **slice 1 of 2**. It delivers the attendance + pick-order read path. It
deliberately does **not** change how the *picker is recorded* — see
[Slice 2 (outline)](#slice-2-outline--deferred).

## The model: a "night" is a `picks` row with `picker_id NULL`

A movie night is a `picks` row (`schema.dbml` already calls picks "one movie
night"). The `picks` table already permits `picker_id NULL` (a planned night whose
picker isn't decided yet). Attendances hang off that row via `pick_id`.

Because `picker_id` is NULL, **a planned night affects nobody's standing**: the
turn ranking (`turn.sql`) groups credited picks by `picker_id`, and a NULL picker
matches no member, so served-counts are untouched until slice 2 assigns a picker.
No change to `picks` is needed.

### The interim seam (deliberate, documented)

For this slice **two ways to create a `picks` row coexist**: the existing
`POST /groups/{gid}/picks` (insert *with* a picker — the record-pick slice) and the
new `POST /groups/{gid}/nights` (insert *without* a picker — a planned night).
This is a known, temporary incoherence. **Slice 2 reconciles them**: recording a
pick becomes *setting the picker on an existing night*, collapsing the two paths.
Until then, the night/attendance flow does not touch record-pick, and record-pick
keeps working unchanged.

## Data model

New migration `0003_attendances.sql` (matches `schema.dbml` exactly):

```sql
CREATE TABLE attendances (
    id      uuid PRIMARY KEY DEFAULT uuidv7(),
    pick_id uuid NOT NULL REFERENCES picks(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX uq_attendance_pick_user ON attendances (pick_id, user_id);
```

`ON DELETE CASCADE` on both FKs and the unique `(pick_id, user_id)` index mirror the
schema. No other tables change.

## Backend — endpoints

All under the existing stdlib `net/http` method-pattern mux, registered in
`main.go`. Handlers mirror `picks.go`/`membership.go`: pure validation helpers + a
thin store interface (one method per query), **no mocks**. FK violations (`23503`)
map to `422` exactly as record-pick does.

| Op | Endpoint | Effect |
|----|----------|--------|
| Create night | `POST /groups/{groupId}/nights` | Body `{ scheduledFor, attendees?: [userId…] }`. Insert a `picks` row (`picker_id NULL`) + any initial attendees in **one transaction**. → `201` with the night DTO. |
| Add attendee | `POST /groups/{groupId}/nights/{nightId}/attendees` | Body `{ userId }`. Idempotent insert (`ON CONFLICT (pick_id,user_id) DO NOTHING`). → `201` with the night DTO. |
| Remove attendee | `DELETE /groups/{groupId}/nights/{nightId}/attendees/{userId}` | Delete the attendance row. Removing a non-attendee is a no-op. → `200` with the night DTO. |
| Night detail | `GET /groups/{groupId}/nights/{nightId}` | The night + its current attendees (for refresh/resume). → `200`. |
| Pick order | `GET /groups/{groupId}/nights/{nightId}/turn` | The **ordered core pick order** over this night's attendees. → `200`. |

Mutating endpoints return the **night DTO** so the mobile client always has the
current attendee list after any change (no extra round-trip).

### DTOs

**Night DTO** — attendees carry `name` and `role` so the UI can distinguish core
from guest (needed so slice 2 can offer guests as pickers):

```json
{
  "id": "<nightId>",
  "scheduledFor": "2026-06-12",
  "attendees": [
    { "id": "<userId>", "name": "Alex", "role": "core" },
    { "id": "<userId>", "name": "Frankie", "role": "guest" }
  ]
}
```

**Pick-order DTO** — identical shape to the existing `/turn` response (element 0 is
tonight's picker; the rest are the skip fall-through order):

```json
[ { "id", "name", "role", "servedCount", "lastPickedOn" }, … ]
```

### Pick order is core-only; guests are recorded, not ranked

The pick order **reuses the existing `RankGroupTurn` query verbatim** — the handler
loads the night's attendee IDs and passes them as the `present` set. `RankGroupTurn`
already filters `status = 'active' AND role = 'core'`, so:

- **Skip** needs no special handling: the full ordered list is returned, so if #1
  skips the group reads down to #2.
- **Guests** appear in the night's `attendees` (recorded as present) but **not** in
  the pick order (they're never in the rotation, per ADR-0005). Handing a guest the
  pick is an *override* recorded at picker-assignment time — **slice 2** — where a
  guest pick is `is_credited = false` so it never moves standings.

**Empty-vs-NULL present set (the one subtle bit).** Today `present = NULL` means
"rank all active core." A night with zero attendees must instead rank *nobody*. So
the handler passes the attendee IDs as a **non-nil, possibly-empty** slice: an empty
`[]uuid.UUID{}` encodes as the SQL array `'{}'` (not NULL), making
`u.id = ANY('{}')` false for everyone → `[]`. Passing `nil` would wrongly rank the
whole roster. This distinction is unit-tested.

### Store interface (sketch)

The real `*db.Queries` satisfies it (same pattern as `turnStore`/`pickStore`):

```go
type nightStore interface {
    CreateNight(ctx, groupID, scheduledFor) (db.Pick, error)
    GetNight(ctx, groupID, nightID) (db.Pick, error)                 // 404 source
    AddAttendee(ctx, nightID, userID) error                          // ON CONFLICT DO NOTHING
    RemoveAttendee(ctx, nightID, userID) error
    ListNightAttendees(ctx, groupID, nightID) ([]AttendeeRow, error) // id, name, role
    RankGroupTurn(ctx, RankGroupTurnParams) ([]RankGroupTurnRow, error) // reused as-is
}
```

`ListNightAttendees` joins `attendances → users → memberships` (the membership in
*this group*) so each attendee carries its `role`; ordered core-first then by name.
The pick-order handler derives the `present` IDs from the same attendee set (a
plan-time choice: a dedicated id-only query or reuse `ListNightAttendees`).

### Validation & errors

- `scheduledFor` not ISO `YYYY-MM-DD` → `400`; `nightId`/`userId` not a UUID → `400`.
- Adding an attendee who isn't a **member of the group** → `422` (validated via the
  existing `GetGroupMember`; this also guarantees a `role` is always available). The
  same membership check applies to every **initial attendee** in the create-night
  body. Non-existent user surfaces as the same `422` (FK `23503` is the backstop).
- `GET`/mutate on a `nightId` that doesn't exist in the group → `404`.
- Removing a non-attendee → `200` (idempotent no-op).
- Adding a duplicate attendee → `201` no-op (idempotent).

## Data / seed

No seed change is required; integration tests create their own nights. The existing
seed already has active core members **and** one guest (`Frankie`), which is enough
to exercise guest attendance end-to-end.

## Mobile

New framework-free client `lib/nights.ts` (fetch + payload validation, kept out of
the screen — same separation as `members.ts`/`picks.ts`):

- `Night` type `{ id, scheduledFor, attendees: Attendee[] }`, `Attendee` `{ id, name, role }`.
- `createNight(baseUrl, groupId, scheduledFor, attendees?, signal?) → Night`
- `getNight(baseUrl, groupId, nightId, signal?) → Night`
- `addAttendee(baseUrl, groupId, nightId, userId, signal?) → Night`
- `removeAttendee(baseUrl, groupId, nightId, userId, signal?) → Night`
- `getNightTurn(baseUrl, groupId, nightId, signal?) → TurnRanking` — reuses the
  existing `parseTurn` from `lib/turn.ts` (identical shape).
- Each throws `request failed: <status>` on non-2xx; a shared `parseNight` validates.

New expo-router screen `app/night.tsx` (registered in `app/_layout.tsx`'s `<Stack>`,
linked from a header action on `app/index.tsx`, mirroring the `/manage` link):

- Reuses `fetchMembers` (`lib/members.ts`) to list everyone (core + guests) with
  role/status — the roster-client reuse this app was always heading toward.
- A date control creates the night (`createNight`); members are checked on/off,
  each toggle calling `addAttendee`/`removeAttendee` and refreshing from the
  returned `Night`.
- Shows the resulting **pick order** (`getNightTurn`): the ordered core attendees,
  element 0 highlighted as tonight's picker, with guests listed separately as
  "also present." In-flight/disabled handling mirrors the record-pick screen
  (one op at a time; failures surface in an error line).

## Testing

**Backend**

- *Unit (pure, table-driven, no mocks):*
  - night-request validation: `scheduledFor` ISO parse, attendee UUID parse +
    **dedupe**, malformed inputs.
  - the **empty-vs-nil present set** decision (empty attendee list ranks nobody;
    `nil` would rank all — assert the handler builds a non-nil empty slice).
  - row→DTO mapping for the night and pick-order shapes.
- *Integration (testcontainers, real Postgres):*
  - create a night with an initial attendee list → `201`; `GET …/turn` returns the
    attendees ranked least-served, and **excludes a core member who isn't attending**.
  - add then remove an attendee → the pick order changes accordingly.
  - a **guest** attendee is recorded in `GET …/night` (with `role: "guest"`) but is
    **absent** from the pick order.
  - empty-attendee night → pick order is `[]`.
  - `422` for adding a non-member / non-existent user; `404` for an unknown night;
    `400` for malformed UUID / `scheduledFor`.

**Mobile**

- `lib/nights` unit tests for `parseNight` (incl. attendee `role`) and rejection of
  bad shapes; integration tests (real local HTTP server, real `fetch`) for create /
  add / remove / night-turn — correct method/path/body, parsed result, throw on non-2xx.

## Out of scope (deferred)

- **Recording the picker** (incl. skip-as-picked and giving a guest the pick) —
  **slice 2** (see outline below).
- Attaching a **movie** to the night (TMDB) — a later slice; `picks.movie_id` and the
  `movies` table remain unbuilt.
- Auth / permissions — backlog "Authentication and account model".
- Helping *decide* availability/the date — out of scope by design (decided off-app).

## Slice 2 (outline) — deferred

Captured now so the seam isn't lost; **the full spec is written when slice 2 starts**
(its details depend on the shape slice 1 actually lands in — "build as we go").

**Goal:** reconcile record-pick with the night model — recording a pick becomes
*setting the picker on an existing night* rather than inserting a new `picks` row,
collapsing the two create paths from the interim seam into one.

**Likely shape:**
- A `POST /groups/{gid}/nights/{nightId}/pick` (or `PATCH` the night) that sets
  `picker_id` on the planned night and finalizes `is_credited`.
- **Any attendee** may be assigned: the #1 core member, a core member out of order
  (a **skip** — the skipped member stays least-served, so they're first next time),
  or a **guest given the pick** (`is_credited = false`, never moves standings).
- The existing `POST /groups/{gid}/picks` is retired or redefined in terms of the
  night flow; the record-pick mobile screen moves onto the night.
- Tests assert: a normal core pick credits the picker and advances the rotation; a
  skip leaves the skipper owed; a guest pick changes no standings.
