# Record-pick / Night Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the two `picks`-row create paths into one — recording a pick becomes *setting the picker on an existing night* — and let a night stay the resumable, correctable "current" session until the next one starts.

**Architecture:** Backend is stdlib `net/http` + sqlc over Postgres; mobile is Expo/React Native with framework-free logic in `lib/`. The model change is entirely at the **query layer** (no migration): relax `GetNight` and `GetCurrentNight` to ignore `picker_id`, add `GetOpenNight` (the old picker-NULL query, kept for create's idempotency) and `SetNightPicker`. A new `POST .../nights/{id}/pick` endpoint sets the picker, deriving `is_credited` from the picker's role. The standalone `POST /picks` path is retired. Mobile moves recording onto the night screen; the turn screen becomes read-only standings.

**Tech Stack:** Go 1.26, sqlc, pgx/v5, testcontainers; Expo SDK 54, TypeScript, `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-06-10-record-pick-night-reconciliation-design.md`

**Conventions to honor:** Tests are table-driven, no mocks (the real `*db.Queries` satisfies the `nightStore` interface; integration uses testcontainers / a real local HTTP server). Never hand-edit `internal/db/*.sql.go` — change the `.sql` and run `just sqlc`. Run backend commands from `backend/`, mobile from `mobile/`. Commit after each task.

---

## File Structure

**Backend** (`backend/`)
- `internal/db/query/nights.sql` — relax `GetNight`/`GetCurrentNight`; add `GetOpenNight` + `SetNightPicker`. Regenerated into `internal/db/nights.sql.go` via `just sqlc`.
- `internal/db/query/picks.sql` — **deleted** (only held `InsertPick`).
- `nights.go` — add `creditedForRole`, `recordNightPickHandler`, `pickerId` on the DTO; extend `nightStore`; rewire `createNightHandler` to `GetOpenNight`.
- `picks.go`, `picks_test.go`, `picks_integration_test.go` — **deleted**.
- `nights_test.go`, `nights_integration_test.go` — extend; invert the two subtests that encode the old model.
- `main.go` — register the pick route; remove the `POST /picks` route.

**Mobile** (`mobile/`)
- `lib/nights.ts` — `Night.pickerId`; `recordNightPick`. Tests in `lib/nights.test.ts`, `lib/nights.integration.test.ts`.
- `lib/picks.ts`, `lib/picks.test.ts`, `lib/picks.integration.test.ts` — **deleted**.
- `app/night.tsx` — record/correct-pick UI.
- `app/index.tsx` — read-only standings (drop tap-to-record).

---

## Task 1: Backend — pick endpoint + relax `GetNight`

**Goal:** Add `POST /groups/{groupId}/nights/{nightId}/pick` that sets the picker (deriving `is_credited` from role) and returns the night DTO now carrying `pickerId`; relax `GetNight` so a finalized night is reloadable for the DTO.

**Files:**
- Modify: `backend/internal/db/query/nights.sql` (relax `GetNight`, add `SetNightPicker`)
- Regenerate: `backend/internal/db/nights.sql.go` (via `just sqlc`)
- Modify: `backend/nights.go` (DTO `pickerId`, `nightStore`, `creditedForRole`, `recordNightPickHandler`)
- Modify: `backend/main.go:56` area (register route)
- Test: `backend/nights_test.go`, `backend/nights_integration_test.go`

**Acceptance Criteria:**
- [ ] `POST .../nights/{id}/pick` with `{"pickerId":"<core attendee>"}` → `200`, DTO `pickerId` set, picker `is_credited` true (reflected in all-time `/turn`).
- [ ] A **guest** attendee assigned → `is_credited` false (standings unchanged).
- [ ] A `pickerId` that is not an attendee → `422`; malformed `pickerId` → `400`; unknown night → `404`.
- [ ] `nightResponse.pickerId` is `null` for an open night, the UUID string once recorded.
- [ ] `just check` passes; new integration subtests pass.

**Verify:** `cd backend && just check` then `go test -tags=integration -run '^TestNightAttendanceIntegration$' ./...` → PASS

**Steps:**

- [ ] **Step 1: Relax `GetNight` and add `SetNightPicker` in `internal/db/query/nights.sql`**

Change the `GetNight` query (remove the `AND picker_id IS NULL` clause) and append `SetNightPicker`:

```sql
-- name: GetNight :one
SELECT id, group_id, picker_id, is_credited, scheduled_for, created_at
FROM picks
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id);

-- name: SetNightPicker :one
UPDATE picks
SET picker_id = sqlc.arg(picker_id), is_credited = sqlc.arg(is_credited)
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id)
RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at;
```

(Leave `CreateNight`, `GetCurrentNight`, `AddAttendee`, `RemoveAttendee`, `ListNightAttendees` untouched in this task.)

- [ ] **Step 2: Regenerate the typed query layer**

Run: `cd backend && just sqlc`
Expected: `internal/db/nights.sql.go` now has `SetNightPicker`/`SetNightPickerParams` and `GetNight`'s SQL no longer contains `picker_id IS NULL`. (Generated — do not hand-edit.)

- [ ] **Step 3: Write the failing unit tests in `nights_test.go`**

Add to `backend/nights_test.go`:

```go
func TestCreditedForRole(t *testing.T) {
	if !creditedForRole(db.MembershipRoleCore) {
		t.Error("core picker must be credited")
	}
	if creditedForRole(db.MembershipRoleGuest) {
		t.Error("guest picker must not be credited")
	}
}
```

Extend `TestToNightResponse` with a picker-id case. Inside the existing `t.Run("maps pick and attendees", ...)`, after the existing assertions, add a finalized-pick assertion as a new subtest:

```go
	t.Run("pickerId is null when unset and the uuid when set", func(t *testing.T) {
		open := toNightResponse(mkPick(), nil)
		if open.PickerID != nil {
			t.Errorf("open night PickerID = %v, want nil", open.PickerID)
		}
		p := mkPick()
		p.PickerID = pgtype.UUID{Bytes: ada, Valid: true}
		got := toNightResponse(p, nil)
		if got.PickerID == nil || *got.PickerID != ada.String() {
			t.Errorf("finalized PickerID = %v, want %s", got.PickerID, ada)
		}
	})
```

Add the `pgtype` import to `nights_test.go`:

```go
	"github.com/jackc/pgx/v5/pgtype"
```

- [ ] **Step 4: Run the unit tests to verify they fail**

Run: `cd backend && go test -run '^TestCreditedForRole$|^TestToNightResponse$' ./...`
Expected: FAIL — `creditedForRole` undefined and `nightResponse` has no `PickerID` field.

- [ ] **Step 5: Add `pickerId` to the DTO in `nights.go`**

Change `nightResponse` (currently `backend/nights.go:77-81`) to add the field:

```go
// nightResponse is the JSON shape for a night and its current attendees.
// PickerID is nil (renders as null) until a pick is recorded.
type nightResponse struct {
	ID           string     `json:"id"`
	ScheduledFor string     `json:"scheduledFor"`
	PickerID     *string    `json:"pickerId"`
	Attendees    []attendee `json:"attendees"`
}
```

Add a helper just above `toNightResponse`:

```go
// pickerIDPtr renders a nullable picker as *string: nil (JSON null) when the
// night is still open, the canonical UUID string once a pick is recorded.
func pickerIDPtr(u pgtype.UUID) *string {
	if !u.Valid {
		return nil
	}
	s := uuid.UUID(u.Bytes).String()
	return &s
}
```

Set it in `toNightResponse` (the `return nightResponse{...}`):

```go
	return nightResponse{
		ID:           p.ID.String(),
		ScheduledFor: p.ScheduledFor.Time.Format("2006-01-02"),
		PickerID:     pickerIDPtr(p.PickerID),
		Attendees:    attendees,
	}
```

- [ ] **Step 6: Add `creditedForRole`, the request type, and the handler in `nights.go`**

Add near the other request types:

```go
// recordPickRequest is the JSON body of POST .../nights/{nightId}/pick.
type recordPickRequest struct {
	PickerID string `json:"pickerId"`
}

// creditedForRole derives is_credited from the picker's role: a core pick moves
// the rotation (credited); a guest pick never does. Pure.
func creditedForRole(role db.MembershipRole) bool {
	return role == db.MembershipRoleCore
}
```

Add `SetNightPicker` to the `nightStore` interface (after `RankGroupTurn`, `backend/nights.go:123`):

```go
	SetNightPicker(ctx context.Context, arg db.SetNightPickerParams) (db.Pick, error)
```

Add the handler (place after `nightTurnHandler`):

```go
// recordNightPickHandler serves POST /groups/{groupId}/nights/{nightId}/pick.
// It sets (or changes — the correction path) the night's picker. The picker MUST
// be an attendee; is_credited is derived from their role, so a guest pick never
// moves standings. RankGroupTurn recomputes served-counts from the picks table on
// read, so re-recording simply re-attributes — there is no stored counter to fix.
func recordNightPickHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := parseGroupAndNight(w, r)
		if !ok {
			return
		}
		var req recordPickRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		pickerID, err := uuid.Parse(req.PickerID)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid picker id")
			return
		}
		if !ensureNight(w, r, store, gid, nightID) {
			return
		}
		rows, err := store.ListNightAttendees(r.Context(), db.ListNightAttendeesParams{GroupID: gid, NightID: nightID})
		if err != nil {
			internalError(w, gid, "list night attendees", err)
			return
		}
		var role db.MembershipRole
		found := false
		for _, row := range rows {
			if row.ID == pickerID {
				role, found = row.Role, true
				break
			}
		}
		if !found {
			writeJSONError(w, http.StatusUnprocessableEntity, "picker is not an attendee of this night")
			return
		}
		if _, err := store.SetNightPicker(r.Context(), db.SetNightPickerParams{
			NightID:    nightID,
			GroupID:    gid,
			PickerID:   pgtype.UUID{Bytes: pickerID, Valid: true},
			IsCredited: creditedForRole(role),
		}); err != nil {
			internalError(w, gid, "set night picker", err)
			return
		}
		writeNightDTO(w, r, store, gid, nightID, http.StatusOK)
	}
}
```

- [ ] **Step 7: Register the route in `main.go`**

After `backend/main.go:58` (the DELETE attendees route), add:

```go
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/pick", recordNightPickHandler(queries))
```

- [ ] **Step 8: Run unit tests + the full check gate**

Run: `cd backend && just check`
Expected: PASS (fmt, vet, build, unit tests including `TestCreditedForRole` and `TestToNightResponse`).

- [ ] **Step 9: Invert the obsolete seam subtest and add record-pick integration coverage**

In `backend/nights_integration_test.go`:

(a) Register the new route in the test mux (after the DELETE route, ~line 31):

```go
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/pick", recordNightPickHandler(q))
```

(b) Add a `recordPick` helper next to the existing `turn` helper:

```go
	recordPick := func(t *testing.T, nightID, pickerID string) nightResponse {
		t.Helper()
		code, b := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+nightID+"/pick", `{"pickerId":"`+pickerID+`"}`)
		if code != http.StatusOK {
			t.Fatalf("record pick status = %d, want 200 (body %s)", code, b)
		}
		var n nightResponse
		if err := json.Unmarshal(b, &n); err != nil {
			t.Fatalf("decode night: %v", err)
		}
		return n
	}
```

(c) **Replace** the subtest `"a real recorded pick is not reachable as a night (seam closed)"` (the block that calls `q.InsertPick`, ~lines 214-239) with:

```go
	t.Run("recording a core picker finalizes the night and credits them", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`","`+blake+`"]}`)
		got := recordPick(t, n.ID, ada)
		if got.PickerID == nil || *got.PickerID != ada {
			t.Fatalf("pickerId = %v, want %s", got.PickerID, ada)
		}
		// A finalized night stays reachable (GetNight no longer filters picker NULL).
		if code, _ := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/"+n.ID, ""); code != http.StatusOK {
			t.Errorf("detail of finalized night = %d, want 200", code)
		}
		// Ada is now credited, so in tonight's order she drops below Blake.
		if order := names(turn(t, n.ID)); len(order) != 2 || order[0] != "Blake" {
			t.Fatalf("post-pick order = %v, want Blake first (Ada credited)", order)
		}
	})

	t.Run("recording a guest picker does not move standings", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`","`+frankie+`"]}`)
		before := names(turn(t, n.ID)) // [Ada]
		got := recordPick(t, n.ID, frankie)
		if got.PickerID == nil || *got.PickerID != frankie {
			t.Fatalf("pickerId = %v, want %s", got.PickerID, frankie)
		}
		if after := names(turn(t, n.ID)); len(after) != len(before) || after[0] != "Ada" {
			t.Fatalf("guest pick changed the order: before %v after %v", before, after)
		}
	})

	t.Run("recording a non-attendee yields 422", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`"]}`)
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+n.ID+"/pick", `{"pickerId":"`+blake+`"}`); code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want 422 (Blake is not an attendee)", code)
		}
	})

	t.Run("recording on an unknown night yields 404; malformed picker yields 400", func(t *testing.T) {
		missing := "b0000000-0000-0000-0000-0000000000ee"
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+missing+"/pick", `{"pickerId":"`+ada+`"}`); code != http.StatusNotFound {
			t.Errorf("unknown-night status = %d, want 404", code)
		}
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`"]}`)
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+n.ID+"/pick", `{"pickerId":"nope"}`); code != http.StatusBadRequest {
			t.Errorf("malformed-picker status = %d, want 400", code)
		}
	})
```

> NOTE: these crediting subtests mutate served-counts for `seededGroup`. They are appended **after** the existing order-assertion subtests and each starts from `createNight` (which clears the open night). The lingering finalized picks they leave behind do not affect earlier subtests (Go runs subtests in source order) and are reset where it matters in Task 2. Do **not** reorder the existing subtests above them.

> The other `q.InsertPick` user — `"current night excludes a finalized (recorded) pick"` (~lines 268-282) — is left for Task 2, which inverts it (it depends on the `GetCurrentNight` relaxation). `q.InsertPick` still exists after this task, so it still compiles.

- [ ] **Step 10: Run the integration suite**

Run: `cd backend && go test -tags=integration -run '^TestNightAttendanceIntegration$' ./...`
Expected: PASS (new record-pick subtests pass; the inverted seam subtest passes).

- [ ] **Step 11: Commit**

```bash
cd backend
git add internal/db/query/nights.sql internal/db/nights.sql.go nights.go main.go nights_test.go nights_integration_test.go
git commit -m "feat(backend): record-pick endpoint (POST .../nights/{id}/pick) + nullable pickerId DTO"
```

---

## Task 2: Backend — cross-session resume (`GetCurrentNight`) + correction

**Goal:** Make a finalized night the resumable "current" one (relax `GetCurrentNight`), preserve create's at-most-one-open-night idempotency by switching it to a new `GetOpenNight`, and prove the re-pick/correction and start-next-night flows.

**Files:**
- Modify: `backend/internal/db/query/nights.sql` (relax `GetCurrentNight`, add `GetOpenNight`)
- Regenerate: `backend/internal/db/nights.sql.go` (via `just sqlc`)
- Modify: `backend/nights.go` (`nightStore` += `GetOpenNight`; `createNightHandler` uses `GetOpenNight`)
- Test: `backend/nights_integration_test.go`

**Acceptance Criteria:**
- [ ] `GET .../nights/current` returns the latest night **regardless of picker** (a finalized night resumes); `404` only when the group has no nights.
- [ ] Re-recording with a different attendee re-attributes standings (old picker no longer credited).
- [ ] After finalizing, `POST /nights` creates a **new** open night, which then becomes current.
- [ ] Creating while a night is still open resumes it (existing idempotency preserved).
- [ ] `just check` and the integration suite pass; `InsertPick` no longer appears in any test.

**Verify:** `cd backend && just check` then `go test -tags=integration -run '^TestNightAttendanceIntegration$' ./...` → PASS

**Steps:**

- [ ] **Step 1: Relax `GetCurrentNight` and add `GetOpenNight` in `internal/db/query/nights.sql`**

Replace the `GetCurrentNight` block with these two queries:

```sql
-- name: GetCurrentNight :one
SELECT id, group_id, picker_id, is_credited, scheduled_for, created_at
FROM picks
WHERE group_id = sqlc.arg(group_id)
ORDER BY scheduled_for DESC, created_at DESC
LIMIT 1;

-- name: GetOpenNight :one
SELECT id, group_id, picker_id, is_credited, scheduled_for, created_at
FROM picks
WHERE group_id = sqlc.arg(group_id) AND picker_id IS NULL
ORDER BY scheduled_for DESC, created_at DESC
LIMIT 1;
```

`GetCurrentNight` now = "latest night, any picker" (backs `GET /nights/current`, the resume path). `GetOpenNight` = the old picker-NULL query (backs create's idempotency). Both generate the signature `func(ctx, groupID uuid.UUID) (Pick, error)`.

- [ ] **Step 2: Regenerate**

Run: `cd backend && just sqlc`
Expected: `internal/db/nights.sql.go` now has both `GetCurrentNight` (no `picker_id IS NULL`) and `GetOpenNight` (with it).

- [ ] **Step 3: Rewire `createNightHandler` and the interface in `nights.go`**

Add `GetOpenNight` to `nightStore` (next to `GetCurrentNight`, `backend/nights.go:118`):

```go
	GetOpenNight(ctx context.Context, groupID uuid.UUID) (db.Pick, error)
```

In `createNightHandler`, change **both** `GetCurrentNight` calls to `GetOpenNight` — the resume-if-open pre-check (`backend/nights.go:233`) and the 23505-race fallback (`backend/nights.go:252`):

```go
		// Resume the open night if one exists — at most one per group.
		if existing, err := store.GetOpenNight(ctx, gid); err == nil {
			writeNightDTO(w, r, store, gid, existing.ID, http.StatusOK)
			return
		} else if !errors.Is(err, pgx.ErrNoRows) {
			internalError(w, gid, "get open night", err)
			return
		}
```

```go
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				existing, gerr := store.GetOpenNight(ctx, gid)
				if gerr != nil {
					internalError(w, gid, "get open night", gerr)
					return
				}
				writeNightDTO(w, r, store, gid, existing.ID, http.StatusOK)
				return
			}
```

(`currentNightHandler` keeps calling `GetCurrentNight` — now the relaxed one. Its comment at `backend/nights.go:339-343` mentioning "planned (picker_id NULL)" and "slice-2 reconciliation will set the picker, naturally dropping the night out of current" is now stale — update it to: "the group's latest night, regardless of whether a pick has been recorded, so the app resumes and can correct it across sessions; 404 only when the group has no nights.")

- [ ] **Step 4: Run the check gate (unit + build)**

Run: `cd backend && just check`
Expected: PASS. (No unit test asserts current-night SQL behavior; that is integration-only.)

- [ ] **Step 5: Add a `clearAllPicks` helper + invert the current-night subtest, add correction coverage**

In `backend/nights_integration_test.go`, add a helper next to `clearOpenNight`:

```go
	// clearAllPicks removes every pick (open and finalized) for a group so a
	// subtest that asserts "current" or recomputed standings starts from the seed
	// baseline. The FK cascade drops attendances.
	clearAllPicks := func(t *testing.T, group string) {
		t.Helper()
		if _, err := pool.Exec(context.Background(),
			"DELETE FROM picks WHERE group_id = $1", group); err != nil {
			t.Fatalf("clear all picks: %v", err)
		}
	}
```

**Replace** the subtest `"current night excludes a finalized (recorded) pick"` (the block calling `q.InsertPick` on `emptyGroup`, ~lines 268-282) with:

```go
	t.Run("current night resumes a finalized night across sessions", func(t *testing.T) {
		clearAllPicks(t, seededGroup)
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`"]}`)
		recordPick(t, n.ID, ada) // finalize it
		code, b := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/current", "")
		if code != http.StatusOK {
			t.Fatalf("current status = %d, want 200 (finalized night must still resume) (body %s)", code, b)
		}
		var got nightResponse
		if err := json.Unmarshal(b, &got); err != nil {
			t.Fatalf("decode current: %v", err)
		}
		if got.ID != n.ID {
			t.Errorf("current id = %s, want the finalized night %s", got.ID, n.ID)
		}
		if got.PickerID == nil || *got.PickerID != ada {
			t.Errorf("current pickerId = %v, want %s", got.PickerID, ada)
		}
	})

	t.Run("re-recording a different attendee re-attributes standings (correction)", func(t *testing.T) {
		clearAllPicks(t, seededGroup)
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`","`+blake+`"]}`)
		recordPick(t, n.ID, ada)   // Ada credited → Blake leads
		if order := names(turn(t, n.ID)); order[0] != "Blake" {
			t.Fatalf("after recording Ada, order = %v, want Blake first", order)
		}
		recordPick(t, n.ID, blake) // correction: now Blake credited → Ada leads
		if order := names(turn(t, n.ID)); order[0] != "Ada" {
			t.Fatalf("after correcting to Blake, order = %v, want Ada first", order)
		}
	})

	t.Run("starting a new night after finalizing creates a fresh open night", func(t *testing.T) {
		clearAllPicks(t, seededGroup)
		first := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`"]}`)
		recordPick(t, first.ID, ada) // finalize → no open night remains
		// createNight's clearOpenNight is a no-op now (none open); POST creates anew.
		code, b := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", `{"scheduledFor":"2026-06-19","attendees":["`+blake+`"]}`)
		if code != http.StatusCreated {
			t.Fatalf("start-next status = %d, want 201 (body %s)", code, b)
		}
		var second nightResponse
		if err := json.Unmarshal(b, &second); err != nil {
			t.Fatalf("decode second night: %v", err)
		}
		if second.ID == first.ID {
			t.Fatal("start-next returned the finalized night; want a brand-new open night")
		}
		// current now points at the new open night.
		_, cb := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/current", "")
		var cur nightResponse
		if err := json.Unmarshal(cb, &cur); err != nil {
			t.Fatalf("decode current: %v", err)
		}
		if cur.ID != second.ID {
			t.Errorf("current id = %s, want the new open night %s", cur.ID, second.ID)
		}
	})
```

> The `emptyGroup` "404 when no nights" subtest (~lines 261-266) stays as-is and still passes (`GetCurrentNight` on a group with zero picks → `ErrNoRows` → 404).

- [ ] **Step 6: Confirm `InsertPick` is gone from tests, then run the suite**

Run: `cd backend && grep -rn "InsertPick" *_test.go`
Expected: no matches (both seam subtests rewritten). If any remain, finish rewriting them before continuing — Task 3 deletes `InsertPick`.

Run: `cd backend && go test -tags=integration -run '^TestNightAttendanceIntegration$' ./...`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd backend
git add internal/db/query/nights.sql internal/db/nights.sql.go nights.go nights_integration_test.go
git commit -m "feat(backend): finalized night resumes as current; re-pick correction; create uses GetOpenNight"
```

---

## Task 3: Backend — retire the standalone `POST /picks`

**Goal:** Remove the now-redundant insert-with-picker path so there is a single create path.

**Files:**
- Delete: `backend/picks.go`, `backend/picks_test.go`, `backend/picks_integration_test.go`
- Delete: `backend/internal/db/query/picks.sql`
- Regenerate: removes `InsertPick`/`InsertPickParams` from `backend/internal/db/picks.sql.go`
- Modify: `backend/main.go` (remove the route)

**Acceptance Criteria:**
- [ ] `POST /groups/{groupId}/picks` is no longer registered.
- [ ] `InsertPick` does not appear anywhere under `backend/`.
- [ ] `just check` and the full integration suite pass.

**Verify:** `cd backend && grep -rn "InsertPick\|createPickHandler\|/picks\b" . ; just check ; go test -tags=integration ./...` → no matches; PASS

**Steps:**

- [ ] **Step 1: Remove the route from `main.go`**

Delete this line (`backend/main.go:48`):

```go
	mux.Handle("POST /groups/{groupId}/picks", createPickHandler(queries))
```

- [ ] **Step 2: Delete the handler, its tests, the query source, and the generated file**

sqlc generates one `.go` per source `.sql` and does **not** delete the generated file when its source is removed, so delete `internal/db/picks.sql.go` explicitly:

```bash
cd backend
git rm picks.go picks_test.go picks_integration_test.go internal/db/query/picks.sql internal/db/picks.sql.go
```

- [ ] **Step 3: Regenerate and confirm nothing is reintroduced**

Run: `cd backend && just sqlc`
Expected: no change to `internal/db/` (sqlc has no `picks.sql` source, so it generates no `picks.sql.go`). `git status` should show `picks.sql.go` still deleted. There is no `Querier` interface (sqlc config does not emit one), so no other generated file references `InsertPick`.

- [ ] **Step 4: Verify nothing references the removed symbols**

Run: `cd backend && grep -rn "InsertPick\|createPickHandler\|pickRequest\|toPickResponse" .`
Expected: no matches.

- [ ] **Step 5: Run the full gate + integration suite**

Run: `cd backend && just check && go test -tags=integration ./...`
Expected: PASS (build proves no dangling references; all integration tests, now free of `InsertPick`, pass).

- [ ] **Step 6: Commit**

```bash
cd backend
git add -A
git commit -m "refactor(backend): retire standalone POST /picks — one create path via the night flow"
```

---

## Task 4: Mobile — `lib/nights` gains `pickerId` + `recordNightPick`

**Goal:** Extend the framework-free night client with the picker field and the record call, fully tested. (Additive — `lib/picks.ts` stays until Task 6 so `app/index.tsx` keeps compiling.)

**Files:**
- Modify: `mobile/lib/nights.ts`
- Test: `mobile/lib/nights.test.ts`, `mobile/lib/nights.integration.test.ts`

**Acceptance Criteria:**
- [ ] `Night.pickerId: string | null`; `parseNight` accepts both and rejects a non-string/non-null `pickerId`.
- [ ] `recordNightPick(baseUrl, groupId, nightId, pickerId, signal?)` POSTs to `.../nights/{nightId}/pick` with body `{ pickerId }` and returns the parsed `Night`; throws `request failed: <status>` on non-2xx.
- [ ] `just check` passes.

**Verify:** `cd mobile && node --import tsx --test lib/nights.test.ts lib/nights.integration.test.ts` → PASS, then `just check` → PASS

**Steps:**

- [ ] **Step 1: Write the failing unit tests in `lib/nights.test.ts`**

Add cases asserting `parseNight` reads `pickerId`. Append:

```ts
test("parseNight reads a set pickerId", () => {
  const n = parseNight({
    id: "n1",
    scheduledFor: "2026-06-12",
    pickerId: "u1",
    attendees: [],
  });
  assert.equal(n.pickerId, "u1");
});

test("parseNight accepts a null pickerId", () => {
  const n = parseNight({
    id: "n1",
    scheduledFor: "2026-06-12",
    pickerId: null,
    attendees: [],
  });
  assert.equal(n.pickerId, null);
});

test("parseNight rejects a non-string, non-null pickerId", () => {
  assert.throws(
    () => parseNight({ id: "n1", scheduledFor: "2026-06-12", pickerId: 7, attendees: [] }),
    /pickerId/,
  );
});
```

(Match the existing import/`test`/`assert` style already at the top of `lib/nights.test.ts`.)

- [ ] **Step 2: Run to verify failure**

Run: `cd mobile && node --import tsx --test lib/nights.test.ts`
Expected: FAIL — `pickerId` is missing / not validated.

- [ ] **Step 3: Add `pickerId` to the type + `parseNight` in `lib/nights.ts`**

Extend the `Night` type (`mobile/lib/nights.ts:9-13`):

```ts
export type Night = {
  id: string;
  scheduledFor: string;
  pickerId: string | null;
  attendees: Attendee[];
};
```

In `parseNight`, destructure and validate `pickerId`, then include it in the return:

```ts
  const { id, scheduledFor, pickerId, attendees } = raw as Record<string, unknown>;
  if (typeof id !== "string") {
    throw new Error("night: id must be a string");
  }
  if (typeof scheduledFor !== "string") {
    throw new Error("night: scheduledFor must be a string");
  }
  if (pickerId !== null && typeof pickerId !== "string") {
    throw new Error("night: pickerId must be a string or null");
  }
  if (!Array.isArray(attendees)) {
    throw new Error("night: attendees must be an array");
  }
  return { id, scheduledFor, pickerId, attendees: attendees.map(parseAttendee) };
```

- [ ] **Step 4: Add `recordNightPick` in `lib/nights.ts`**

After `getNightTurn`:

```ts
// recordNightPick sets (or corrects) the night's picker. The backend derives
// is_credited from the picker's role, so the client sends only the id.
export function recordNightPick(
  baseUrl: string,
  groupId: string,
  nightId: string,
  pickerId: string,
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(`${baseUrl}/groups/${groupId}/nights/${nightId}/pick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pickerId }),
    signal,
  });
}
```

- [ ] **Step 5: Write the integration test in `lib/nights.integration.test.ts`**

Add a case following the existing real-local-server pattern in that file (reuse its server harness — inspect the top of the file for the helper that starts a server and returns its base URL). The new case:

```ts
test("recordNightPick POSTs pickerId and returns the night", async () => {
  const { baseUrl, requests, close } = await startServer((req, body) => ({
    status: 200,
    json: { id: "n1", scheduledFor: "2026-06-12", pickerId: "u1", attendees: [] },
  }));
  try {
    const night = await recordNightPick(baseUrl, "g1", "n1", "u1");
    assert.equal(night.pickerId, "u1");
    const last = requests.at(-1)!;
    assert.equal(last.method, "POST");
    assert.equal(last.url, "/groups/g1/nights/n1/pick");
    assert.deepEqual(last.body, { pickerId: "u1" });
  } finally {
    await close();
  }
});
```

> Adapt the harness call (`startServer`, `requests`, `close`) to whatever this file already defines — do not introduce a second server helper. If the existing helper has a different shape, mirror it exactly (same handler signature and assertions on method/url/body) as the sibling `addAttendee`/`createNight` integration cases.

- [ ] **Step 6: Run both test files**

Run: `cd mobile && node --import tsx --test lib/nights.test.ts lib/nights.integration.test.ts`
Expected: PASS.

- [ ] **Step 7: Full mobile gate**

Run: `cd mobile && just check`
Expected: PASS (lint + typecheck + test). `app/index.tsx` and `app/night.tsx` still compile — `Night.pickerId` is additive and they do not yet read it.

- [ ] **Step 8: Commit**

```bash
cd mobile
git add lib/nights.ts lib/nights.test.ts lib/nights.integration.test.ts
git commit -m "feat(mobile): lib/nights gains pickerId + recordNightPick"
```

---

## Task 5: Mobile — record/correct the pick on the night screen

**Goal:** Let the night screen record a pick by tapping an attendee, badge the recorded picker, allow tapping someone else to correct it, and offer "Start a new night" once the current one is finalized.

**Files:**
- Modify: `mobile/app/night.tsx`

**Acceptance Criteria:**
- [ ] Tapping a core member in the pick order records them (`recordNightPick`); tapping a present guest records them too.
- [ ] After recording, the picker is badged "Recorded ✓"; tapping a different attendee changes the pick and the order refreshes.
- [ ] When the resumed night already has a `pickerId`, a "Start a new night" action is shown (calls `createNight` for today and replaces the screen's night).
- [ ] `just check` passes (lint + typecheck; this screen has no unit test, matching the existing screens).

**Verify:** `cd mobile && just check` → PASS

**Steps:**

- [ ] **Step 1: Import `recordNightPick` and track the recording target**

In `mobile/app/night.tsx`, add `recordNightPick` to the import from `../lib/nights` (it currently imports `addAttendee, createNight, getCurrentNight, getNightTurn, removeAttendee, type Night`). The existing `busy` state (member id or `"create"`) already serializes one action at a time — reuse it for recording.

- [ ] **Step 2: Add the record/correct handler**

Add alongside `onToggle`:

```tsx
  const onRecordPick = useCallback(
    async (memberId: string) => {
      if (night === null || busy !== null) {
        return;
      }
      setBusy(memberId);
      setActionError(null);
      try {
        const updated = await recordNightPick(API_URL, GROUP_ID, night.id, memberId);
        setNight(updated);
        try {
          await refreshOrder(updated.id);
        } catch (e) {
          setActionError(e instanceof Error ? e.message : "failed to load pick order");
        }
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "failed to record pick");
      } finally {
        setBusy(null);
      }
    },
    [night, busy, refreshOrder],
  );

  const onStartNew = useCallback(async () => {
    if (busy !== null) {
      return;
    }
    setBusy("create");
    setActionError(null);
    try {
      const created = await createNight(API_URL, GROUP_ID, todayLocalISO());
      setNight(created);
      setOrder([]);
      try {
        await refreshOrder(created.id);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "failed to load pick order");
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "failed to start a new night");
    } finally {
      setBusy(null);
    }
  }, [busy, refreshOrder]);
```

- [ ] **Step 3: Make pick-order rows tappable to record, and badge the recorded picker**

Replace the pick-order `order.map(...)` block (currently `mobile/app/night.tsx:183-188`) so each row is a `Pressable` that records on tap and shows the recorded/picker state. `night.pickerId` drives the badge:

```tsx
                  order.map((m, i) => {
                    const recorded = night?.pickerId === m.id;
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => onRecordPick(m.id)}
                        disabled={busy !== null}
                        style={({ pressed }) => [
                          styles.orderRow,
                          (recorded || (night?.pickerId == null && i === 0)) && styles.pickerRow,
                          pressed && styles.rowPressed,
                        ]}
                      >
                        <Text style={styles.name}>{`${i + 1}. ${m.name}`}</Text>
                        {recorded ? (
                          <Text style={styles.badge}>{"Recorded ✓"}</Text>
                        ) : night?.pickerId == null && i === 0 ? (
                          <Text style={styles.badge}>{"Tonight's pick"}</Text>
                        ) : null}
                      </Pressable>
                    );
                  })
```

- [ ] **Step 4: Make present guests tappable too, and add the "Start a new night" action**

Replace the `guestsPresent` hint (currently `mobile/app/night.tsx:190-194`) with tappable guest rows so a guest can be given the pick:

```tsx
                {guestsPresent.length > 0 && (
                  <>
                    <Text style={styles.section}>{"Also present"}</Text>
                    {guestsPresent.map((g) => {
                      const recorded = night?.pickerId === g.id;
                      return (
                        <Pressable
                          key={g.id}
                          onPress={() => onRecordPick(g.id)}
                          disabled={busy !== null}
                          style={({ pressed }) => [styles.orderRow, recorded && styles.pickerRow, pressed && styles.rowPressed]}
                        >
                          <Text style={styles.name}>{g.name}</Text>
                          {recorded && <Text style={styles.badge}>{"Recorded ✓"}</Text>}
                        </Pressable>
                      );
                    })}
                  </>
                )}
                {night?.pickerId != null && (
                  <View style={styles.createRow}>
                    <Text style={styles.hint}>{"Pick recorded. Tap another name to change it, or start the next night."}</Text>
                    <Button title="Start a new night" onPress={onStartNew} disabled={busy !== null} />
                  </View>
                )}
```

(`onCreate` for the very first night and the no-night branch stay as they are. `Pressable`/`Button` are already imported.)

- [ ] **Step 5: Run the gate**

Run: `cd mobile && just check`
Expected: PASS. If the typechecker flags an unused `i` or similar, adjust per its message (keep `i` — it drives the "Tonight's pick" badge on the open night).

- [ ] **Step 6: Commit**

```bash
cd mobile
git add app/night.tsx
git commit -m "feat(mobile): record and correct the pick on the night screen"
```

---

## Task 6: Mobile — retire `lib/picks`; make the turn screen read-only standings

**Goal:** Remove the standalone record-pick client and turn `app/index.tsx` into read-only all-time standings, completing the single-path reconciliation on mobile.

**Files:**
- Modify: `mobile/app/index.tsx`
- Delete: `mobile/lib/picks.ts`, `mobile/lib/picks.test.ts`, `mobile/lib/picks.integration.test.ts`

**Acceptance Criteria:**
- [ ] `app/index.tsx` no longer imports or calls `recordPick`; rows are not tappable; the "Tonight →" / "Manage members →" links remain.
- [ ] `lib/picks.*` are deleted; no file under `mobile/` references `picks`.
- [ ] `just check` passes.

**Verify:** `cd mobile && grep -rn "lib/picks\|recordPick" app lib ; just check` → no matches; PASS

**Steps:**

- [ ] **Step 1: Strip recording from `app/index.tsx`**

Remove the `recordPick` import (`mobile/app/index.tsx:15`) and the `todayLocalISO` import if it becomes unused. Delete the `onRecord` callback, the `recordingId`/`recordingRef` state, and the `recordError` state/banner. Replace the row `Pressable` with a non-interactive `View` (read-only standings):

```tsx
            renderItem={({ item, index }) => {
              const isPicker = index === 0;
              const picks = `${item.servedCount} pick${item.servedCount === 1 ? "" : "s"}`;
              const last = item.lastPickedOn ?? "never";
              return (
                <View style={[styles.row, isPicker && styles.pickerRow]}>
                  <View style={styles.rowMain}>
                    <Text style={styles.name}>{item.name}</Text>
                    {isPicker && <Text style={styles.badge}>{"Next up"}</Text>}
                  </View>
                  <Text style={styles.meta}>{`${picks} · last: ${last}`}</Text>
                </View>
              );
            }}
```

Remove the now-unused `recordError` banner block and drop `Pressable` from the `react-native` import if nothing else uses it. Keep the loading/error/empty states and the `<Link>` header. (The badge label changes from "Tonight's pick" to "Next up" because this is the all-time standings view, not tonight's recordable pick.)

- [ ] **Step 2: Delete the picks client and its tests**

```bash
cd mobile
git rm lib/picks.ts lib/picks.test.ts lib/picks.integration.test.ts
```

- [ ] **Step 3: Verify nothing references `picks` and run the gate**

Run: `cd mobile && grep -rn "lib/picks\|recordPick\|from \"./picks\"" app lib`
Expected: no matches.

Run: `cd mobile && just check`
Expected: PASS (lint + typecheck catch any dangling import; tests green).

- [ ] **Step 4: Commit**

```bash
cd mobile
git add app/index.tsx lib
git commit -m "refactor(mobile): retire lib/picks; turn screen becomes read-only standings"
```

---

## Final verification (after all tasks)

- [ ] `cd backend && just check && go test -tags=integration ./...` → PASS
- [ ] `cd mobile && just check` → PASS
- [ ] `grep -rn "InsertPick" backend` and `grep -rn "lib/picks\|recordPick" mobile/app mobile/lib` → no matches (seam fully collapsed)
- [ ] Manual smoke (optional, per the `run`/`verify` skills): start backend + Metro, resume tonight's night, tap to record, tap another to correct, confirm standings update and "Start a new night" appears.

Then use the **finishing-a-development-branch** skill to open the PR for `feat/record-pick-night-reconciliation`.
