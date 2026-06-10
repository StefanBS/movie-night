# Record-pick / Night Reconciliation — Design

**Date:** 2026-06-10
**Status:** Approved (brainstorm)
**ADRs:** [ADR-0005](../../adr/0005-least-served-turn-ranking.md) (least-served ranking), [ADR-0004](../../adr/0004-people-and-membership-roles.md) (people/roles/guests), [ADR-0006](../../adr/0006-membership-churn-handling.md) (credited picks)
**Precedes:** [Night Attendance & Pick Order](2026-06-09-night-attendance-design.md) — this is **slice 2 of 2**, the reconciliation that slice's outline deferred.

## Goal

Collapse the interim seam from the night-attendance slice: today **two ways to create
a `picks` row coexist** — `POST /groups/{gid}/picks` (insert *with* a picker, the
record-pick slice) and `POST /groups/{gid}/nights` (insert *without* a picker, a
planned night). Slice 2 makes **recording a pick = setting the picker on an existing
night**, leaving **one create path**. The standalone `POST /picks` is retired.

Real-world flow: the group fixes a night and an attendee list (slice 1); the pick
order says whose turn it is; someone is tapped to record the pick. The #1 person may
**skip** (tap #2 instead); a **guest** may be given the pick. Mistakes can be
corrected by tapping a different attendee.

## Decisions (from brainstorm)

1. **Endpoint shape:** an action sub-resource, `POST .../nights/{nightId}/pick` — reads
   as "record the pick for this night," mirroring the existing resource-action style.
2. **`is_credited` is derived from the picker's role** (core → `true`, guest → `false`).
   No client field — removes a footgun and handles skip & guest correctly by
   construction.
3. **Retire `POST /groups/{gid}/picks`** — one create path. The mobile turn screen
   moves recording onto the night screen and becomes read-only standings.
4. **Re-pick / correction is allowed, resumable across sessions** — a night stays the
   "current" correctable session until a *new* night is explicitly started.

## The model change: a night is "current" until the next one starts

Today "current / open night" ≡ `picker_id IS NULL`. We redefine **current = the
group's most recent night row, regardless of picker.** A night stays the resumable,
correctable session until a *new* night is explicitly started; recording a pick no
longer makes the night disappear — it just sets the picker.

**No schema migration is needed** — `picker_id` (nullable), `is_credited`, the
`attendances` table, and the `uq_open_night_per_group` partial unique index all
already exist. The change is at the query layer:

| Query | Change | Used by |
|---|---|---|
| `GetNight` | Drop `AND picker_id IS NULL` → find a night by `(id, group)` regardless of picker | `ensureNight`, `writeNightDTO`, the `/pick` handler — so a **finalized** night stays viewable/correctable |
| `GetCurrentNight` (keeps the name — matches the `/nights/current` route) | Drop `picker_id IS NULL` → latest night by `scheduled_for DESC, created_at DESC` | `GET /nights/current` — resumes the finalized night across app restarts |
| `GetOpenNight` (**rename** of the old picker-NULL `GetCurrentNight`) | SQL unchanged (`WHERE picker_id IS NULL`, latest) | `createNightHandler`'s resume-if-open idempotency + the 23505-race fallback |

**The `uq_open_night_per_group` index stays as-is.** It still guarantees at most one
*unpicked* night, so create's "resume the open one" idempotency (and the
double-tap / concurrent-create guard) is untouched. Re-pick only ever changes a
picker to *another person* — it never sets one back to NULL — so a finalized night
never re-enters the open set and the index is never violated.

**Create vs. resume, end state:** the mobile screen resumes via `GetCurrentNight`
(which now returns a finalized night too); it only `POST /nights` when there is no
open night — i.e. first-ever use, or an explicit "start next night" after the current
one is finalized. Both cases have no open night, so create inserts cleanly and the new
night becomes "current."

### Known edge (accepted, documented)

With "current = most recent row," the *most recent existing pick* becomes "current."
In a freshly-seeded or historical DB that is an old finalized pick with no attendees —
the night screen resumes it showing "recorded: X, no attendees" until the user taps
"Start a new night." Harmless. Integration tests build their own data, so they are
unaffected. We do **not** actively guard against this.

## Backend — the pick endpoint

`POST /groups/{groupId}/nights/{nightId}/pick`, body `{ "pickerId": "<uuid>" }`.
**No `isCredited` field** — derived from the picker's role.

Handler flow (mirrors the existing night handlers: pure validation helpers + a thin
store interface, **no mocks**):

1. Parse `groupId`, `nightId`, `pickerId` → `400` on any malformed value.
2. `ensureNight` (relaxed `GetNight`) → `404` if the night isn't in the group.
3. Load `ListNightAttendees`; find `pickerId` among them.
   - **Not an attendee → `422`** ("picker is not an attendee of this night").
     Attendee-ness implies membership, so this subsumes the member check.
   - Read the picker's `role` from that same row → **`isCredited = (role == "core")`**.
     A guest picker yields `false`, so it never moves standings. A pure helper
     `creditedForRole(role) bool` carries the rule and is unit-tested.
4. `SetNightPicker(nightId, groupId, pickerId, isCredited)` — an `UPDATE … RETURNING`
   (`:one`). **Repeatable**: calling again with a different picker is the **correction**
   path. `RankGroupTurn` recomputes served-counts from the `picks` table on read, so
   re-crediting simply re-attributes — there is no stored counter to fix.
5. Return the **night DTO** (now carrying `pickerId` — see below).

**Skip needs no code:** tapping #2 credits #2; the skipped #1 was never credited, so
they remain least-served and lead next time.

### `SetNightPicker` query

```sql
-- name: SetNightPicker :one
UPDATE picks
SET picker_id = sqlc.arg(picker_id), is_credited = sqlc.arg(is_credited)
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id)
RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at;
```

## Backend — retiring `POST /groups/{gid}/picks`

Full collapse to one create path:

- Delete the route registration from `main.go`.
- Delete `picks.go`, `picks_test.go`, `picks_integration_test.go`.
- Delete the `InsertPick` query (`internal/db/query/picks.sql` becomes empty → remove
  the file).
- `just sqlc` to drop `InsertPick` / `InsertPickParams` from generated code.

## Night DTO + store interface

`nightResponse` gains **`pickerId string`**, rendered as `null` when unset (mapped
from `db.Pick.PickerID`):

```json
{
  "id": "<nightId>",
  "scheduledFor": "2026-06-12",
  "pickerId": "<uuid>|null",
  "attendees": [
    { "id": "<userId>", "name": "Alex", "role": "core" },
    { "id": "<userId>", "name": "Frankie", "role": "guest" }
  ]
}
```

`nightStore` gains `SetNightPicker` and `GetOpenNight`; `GetNight` / `GetCurrentNight`
change behavior but keep their signatures. The picker's role is read from the existing
`ListNightAttendees` rows — **no new query** for the role lookup. The real `*db.Queries`
continues to satisfy the interface.

## Mobile

- **`lib/nights.ts`**: `Night` gains `pickerId: string | null`; `parseNight` validates
  it. New `recordNightPick(baseUrl, groupId, nightId, pickerId, signal?) → Night`.
  Delete `lib/picks.ts` and its unit/integration tests.
- **`app/night.tsx`** becomes the single record/correct surface. After resume it shows
  attendees (still toggleable — attendance stays editable on a finalized night) and
  the pick order. **Tapping an attendee records them as tonight's picker** — core rows
  in the order, and guest rows under "also present" are tappable too (a guest pick is
  allowed, uncredited). Once `pickerId` is set, that person is badged **"Recorded ✓"**
  and tapping anyone else **changes** the pick (re-fetching the order, which re-ranks
  now that the picker is credited). A **"Start a new night"** action appears when the
  current night is already finalized. In-flight/disabled handling mirrors the existing
  screen (one op at a time; failures surface in an error line).
- **`app/index.tsx`** (turn screen) drops its tap-to-record and becomes **read-only
  all-time standings** (`fetchTurn`) plus the existing "Tonight →" / "Manage members →"
  links. The `recordPick` import is removed.

## Testing

**Backend**

- *Unit (pure, table-driven, no mocks):*
  - `creditedForRole` — core → `true`, guest → `false`.
  - `pickerId` UUID-parse validation (malformed → error).
  - night DTO mapping of `pickerId` — both `null` (unset) and a set UUID.
- *Integration (testcontainers, real Postgres):*
  - record a core picker → DTO carries `pickerId`, `isCredited` true; the all-time
    `RankGroupTurn` now credits them (served-count up, they drop in the order).
  - **re-pick to a different attendee → standings re-attribute** (the previous picker
    is no longer credited) — the correction path.
  - **guest picker → `isCredited` false**, standings unchanged.
  - non-attendee picker → `422`.
  - **`GetCurrentNight` returns a finalized night** (cross-session resume); detail and
    `/turn` work on a finalized night.
  - start a new night after finalizing → a fresh open night becomes "current."
  - malformed UUID / unknown night → `400` / `404`.

**Mobile**

- `lib/nights` unit tests: `recordNightPick` (method/path/body, parsed result, throw
  on non-2xx) and `parseNight` accepting `pickerId` (set + null) and rejecting bad
  shapes. Remove the `picks` unit + integration tests.
- Integration test (real local HTTP server, real `fetch`) for the record path.

## Out of scope (deferred)

- **Attaching a movie** to the night (TMDB) — a later slice; `picks.movie_id` and the
  `movies` table remain unbuilt.
- **Auth / permissions** — backlog "Authentication and account model".
- **Un-recording** a pick (setting picker back to NULL / reopening a night) —
  correction only ever swaps the picker to another attendee.
- Streaming-availability surfacing, the no-back-to-back guard, and the
  baseline-seeding policy — all remain deferred in the [backlog](../../adr/backlog.md).
