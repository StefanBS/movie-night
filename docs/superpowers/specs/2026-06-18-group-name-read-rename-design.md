# Group name read & rename (#41)

**Issue:** [#41](https://github.com/StefanBS/movie-night/issues/41) — Backend P2.3 · part of #28 Phase 2.
**Date:** 2026-06-18

## Summary

Issue #41 was filed as "group settings / house rules persistence": persist the
Settings screen toggles (allow skipping, guests can pick), the group name, and
notification prefs behind a new settings table/columns + GET/PATCH endpoints.

During design the scope was deliberately cut to nothing-speculative:

- **Allow skipping — dropped.** Skipping is always allowed app-wide; there is no
  concrete "forbid skipping" use case, so a persisted toggle nothing reads is
  dead config. The skip endpoint (#42) is unconditional.
- **Guests can pick — dropped.** The backend already lets *any* attendee be the
  picker (`recordNightPickHandler`); a guest's pick is simply not *credited*
  (`creditedForRole` → only `core` moves the rotation). A `guests_can_pick`
  toggle could only ever *restrict* behavior that already works, and we don't
  want the restriction — an admin just records the guest as picker.
- **Notification prefs — deferred** to #50 (Phase 5), which is where an actual
  notification toggle is defined. No column for a UI that doesn't exist.

What remains is the group's **name** and **since** (`created_at`) — both already
columns on `groups`. So #41 is **not** a settings store: there is **no new
table, no column, and no migration**. It exposes the group resource so the
Settings screen shows real data instead of the hardcoded `GROUP_NAME`, and lets
an admin rename the group. This matches what the code already predicts — the
`mobile/lib/api.ts` TODO says #41 is when `GROUP_NAME` "is swapped for a fetch
(and the card gains a 'since' line)."

## Goals

- `GET /groups/{groupId}` returns the group's name and creation date.
- `PATCH /groups/{groupId}` renames the group.
- The Settings screen's Group card renders the real name + "since", and the name
  row is tap-to-rename.
- The Settings screen drops its unbacked rotation toggles and "not saved yet"
  banner; `GROUP_NAME` is removed.

## Non-goals

- No settings table/columns, no migration (name + created_at already exist).
- No rotation/pick behavior change (guests can already pick; skipping always
  allowed). This issue persists *no* rules — there are none left to persist.
- Notifications and Danger-zone (Reset history / Leave group) stay
  deferred/disabled, unchanged.
- The static "THE HOUSE RULE" card stays as brand copy, not a setting.

## Backend design

New file `group.go` holds the group-resource handlers, following the
`membership.go` / `nights.go` shape: a narrow `groupStore` interface (subset of
`*db.Queries`, satisfied by the real one so no mock is written), a pure
validator, and handlers that lean on the `http.go` contract helpers
(`pathUUID`, `decodeJSON`, `respondJSON`, `writeJSONError`, `internalError`).

### Endpoints

**`GET /groups/{groupId}`**
- 200 → `{ "name": "Friday Film Club", "createdOn": "2026-05-01" }`
- 400 if `groupId` is not a UUID (`pathUUID`).
- 404 `{"error":"group not found"}` when no group matches (`pgx.ErrNoRows`).

**`PATCH /groups/{groupId}`**
- Body `{ "name": "New name" }`.
- 200 → the updated `{ "name", "createdOn" }`.
- 400 on malformed JSON (`decodeJSON`) or empty/whitespace-only name
  (`{"error":"name is required"}`).
- 404 when no group matches (the `RETURNING` update affects no row → `:one`
  yields `pgx.ErrNoRows`).

`createdOn` is `created_at` (a `timestamptz`) formatted `YYYY-MM-DD`, reusing the
existing `memberDate(pgtype.Timestamptz)` helper — the same convention as
`joinedOn` / `scheduledFor`. Mobile labels it "since".

### Response DTO

```go
type groupResponse struct {
    Name      string `json:"name"`
    CreatedOn string `json:"createdOn"`
}
```

### Validation (pure, table-tested)

```go
// validateGroupName trims and requires a non-empty name. Mirrors validateJoin's
// name handling. Pure — no DB.
func validateGroupName(raw string) (string, error)
```

### Queries — `internal/db/query/groups.sql` (then `just sqlc`)

```sql
-- name: GetGroup :one
SELECT id, name, created_at FROM groups WHERE id = $1;

-- name: RenameGroup :one
UPDATE groups SET name = $2 WHERE id = $1
RETURNING id, name, created_at;
```

Single editable field (name), so no `COALESCE`/partial-update machinery is
needed — `RenameGroup` is a plain update whose empty result set (unknown group)
surfaces as `pgx.ErrNoRows`, mapped to 404.

### Routing — `main.go`

```go
mux.Handle("GET /groups/{groupId}", getGroupHandler(queries))
mux.Handle("PATCH /groups/{groupId}", renameGroupHandler(queries))
```

(These are the first routes on the bare `/groups/{groupId}` resource; existing
routes are all sub-resources — `/members`, `/turn`, `/nights`.)

## Mobile design

### `lib/group.ts` (mirrors `lib/members.ts` over `requestJson`)

```ts
export type Group = { name: string; createdOn: string };

function parseGroup(raw: unknown): Group;       // validates name + createdOn are strings
export function fetchGroup(baseUrl, groupId, signal?): Promise<Group>;   // GET
export function renameGroup(baseUrl, groupId, name, signal?): Promise<Group>; // PATCH
```

`renameGroup` PATCHes `{ name }` with a JSON content-type, parsing the returned
group (same shape) through `parseGroup`.

### `app/(tabs)/settings.tsx`

- Resolve `API_URL` (`resolveApiBaseUrl`) + `GROUP_ID`/`resolveGroupId` as the
  other tab screens do; `fetchGroup` on mount with loading + error states.
- **Group card:** `<SettingsRow label={group.name} value={sinceLabel} onPress={...} />`
  where `sinceLabel` is `"Since " + formatMonthYear(group.createdOn)` (reusing
  `lib/date.ts`). The existing `SettingsRow` already renders a mono `value` on
  the right and supports `onPress` — no primitive change.
- **Rename:** inline edit within the screen (no new route). Tapping the name row
  sets an `editing` flag that swaps the label for an `Input` (autoFocus,
  prefilled with the current name). On submit: trim, ignore empty, call
  `renameGroup`, update local state and exit edit mode; on failure surface the
  message (`errorMessage`) and stay in edit mode. Pattern mirrors
  `member/new.tsx` (`name.trim()` guard + busy flag).
- **Remove:** the entire "Rotation" `SectionLabel` + card (both toggles and
  their `useState`), and the "Settings aren't saved yet" `Banner`. Notifications
  + Danger-zone sections are untouched.

### `lib/api.ts`

Remove the now-unused `GROUP_NAME` export and its comment. (`GROUP_ID` /
`resolveGroupId` stay.) Confirm no other references remain.

## Testing

**Backend**
- `group_test.go` — table-driven `validateGroupName` (valid, trims surrounding
  whitespace, empty → error, whitespace-only → error).
- `group_integration_test.go` (`//go:build integration`, shared harness) —
  GET seeded group (name + `createdOn`), GET unknown group → 404, PATCH rename →
  200 with new name, PATCH empty name → 400, PATCH unknown group → 404, PATCH
  malformed body → 400. Builds its own mux from the two handlers + `seedFixtures`.

**Mobile**
- `lib/group.test.ts` — `parseGroup` happy path + rejects non-object, missing /
  non-string `name`, missing / non-string `createdOn` (node:test, table-driven).
- `lib/group.integration.test.ts` — real local HTTP server: `fetchGroup` decodes
  a served group; `renameGroup` PATCHes and decodes the response; a non-2xx
  surfaces the backend `{"error"}` message (same shape as `members.integration`).

## Shared contract

The seeded group `11111111-1111-1111-1111-111111111111` ("Friday Film Club")
already drives the seed, the app, and the integration harness. After this change
the app reads that name from `GET /groups/{groupId}` rather than the `GROUP_NAME`
constant; the seed value is unchanged.

## Follow-ups (out of scope)

- #42 skip-turn endpoint (skipping is unconditional; no setting gates it).
- #50 notification prefs (Phase 5) — defines the first real notification toggle.
- The issue text (settings table + toggles) is overtaken by these scope cuts;
  the PR body will explain the reduction.
