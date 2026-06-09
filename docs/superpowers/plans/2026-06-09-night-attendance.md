# Night Attendance & Pick Order — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist who attends a movie night and compute the pick order over those attendees, replacing the manual `?present=` query param.

**Architecture:** A "night" is a `picks` row with `picker_id NULL`; a new `attendances` table hangs off it. Five stdlib `net/http` endpoints (create night, add/remove attendee, night detail, pick order) follow the existing handler+thin-store pattern, and the pick-order endpoint reuses the existing `RankGroupTurn` query by passing the night's attendee IDs as its `present` set. The mobile app gains a framework-free `lib/nights.ts` client and an expo-router `night` screen.

**Tech Stack:** Go 1.26 (`net/http`, sqlc v1.31.1, pgx/v5, goose migrations), PostgreSQL 18; Expo SDK 54 / React Native, `node:test` via `tsx`.

**Spec:** [`docs/superpowers/specs/2026-06-09-night-attendance-design.md`](../specs/2026-06-09-night-attendance-design.md)

**Branch:** `feat/night-attendance` (already created, spec already committed).

---

## File map

| File | Responsibility | Task |
|------|----------------|------|
| `backend/migrations/0003_attendances.sql` | `attendances` table + unique index | 1 |
| `backend/internal/db/query/nights.sql` | hand-written SQL (CreateNight, GetNight, AddAttendee, RemoveAttendee, ListNightAttendees) | 1 |
| `backend/internal/db/nights.sql.go` | sqlc-**generated** (DO NOT EDIT) | 1 |
| `backend/internal/db/models.go` | sqlc regenerates `Attendance` struct | 1 |
| `backend/nights.go` | request/response types, pure validation helpers, handlers, `nightStore` | 2, 3 |
| `backend/nights_test.go` | pure unit tests (validation, DTO mapping, present-set) | 2 |
| `backend/nights_integration_test.go` | testcontainers integration tests | 3 |
| `backend/main.go` | register the five routes | 3 |
| `mobile/lib/nights.ts` | fetch + payload validation for nights | 4 |
| `mobile/lib/nights.test.ts` | pure `parseNight` unit tests | 4 |
| `mobile/lib/nights.integration.test.ts` | real-local-server integration tests | 4 |
| `mobile/app/night.tsx` | the night screen | 5 |
| `mobile/app/_layout.tsx` | register the `night` route | 5 |
| `mobile/app/index.tsx` | add a header link to `/night` | 5 |

---

### Task 1: Database layer — migration + queries + sqlc generation

**Goal:** Create the `attendances` table and the SQL queries the handlers need, then generate the Go data layer.

**Files:**
- Create: `backend/migrations/0003_attendances.sql`
- Create: `backend/internal/db/query/nights.sql`
- Generated (do not hand-edit): `backend/internal/db/nights.sql.go`, `backend/internal/db/models.go`

**Acceptance Criteria:**
- [ ] `attendances` table exists with FK cascades and a unique `(pick_id, user_id)` index.
- [ ] `just sqlc` generates `CreateNight`, `GetNight`, `AddAttendee`, `RemoveAttendee`, `ListNightAttendees` on `*db.Queries`.
- [ ] `just build` compiles; existing `just test-integration` still passes (proves the migration applies cleanly).

**Verify:** `cd backend && just sqlc && just build && just test-integration` → builds; all existing integration tests pass.

**Steps:**

- [ ] **Step 1: Write the migration**

Create `backend/migrations/0003_attendances.sql` (mirrors `0002_picks.sql`'s goose block style and `schema.dbml`):

```sql
-- +goose Up
-- +goose StatementBegin
CREATE TABLE attendances (
    id      uuid PRIMARY KEY DEFAULT uuidv7(),
    pick_id uuid NOT NULL REFERENCES picks(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE UNIQUE INDEX uq_attendance_pick_user ON attendances (pick_id, user_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS attendances;
-- +goose StatementEnd
```

- [ ] **Step 2: Write the queries**

Create `backend/internal/db/query/nights.sql`. A night is a `picks` row with `picker_id` left NULL; `ListNightAttendees` INNER-joins `memberships` so every attendee carries a `role` (the handler guarantees only members are ever added).

```sql
-- name: CreateNight :one
INSERT INTO picks (group_id, scheduled_for)
VALUES (sqlc.arg(group_id), sqlc.arg(scheduled_for))
RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at;

-- name: GetNight :one
SELECT id, group_id, picker_id, is_credited, scheduled_for, created_at
FROM picks
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id);

-- name: AddAttendee :exec
INSERT INTO attendances (pick_id, user_id)
VALUES (sqlc.arg(pick_id), sqlc.arg(user_id))
ON CONFLICT (pick_id, user_id) DO NOTHING;

-- name: RemoveAttendee :exec
DELETE FROM attendances
WHERE pick_id = sqlc.arg(pick_id) AND user_id = sqlc.arg(user_id);

-- name: ListNightAttendees :many
SELECT u.id, u.name, m.role
FROM attendances a
JOIN users u ON u.id = a.user_id
JOIN memberships m ON m.user_id = a.user_id AND m.group_id = sqlc.arg(group_id)
WHERE a.pick_id = sqlc.arg(night_id)
ORDER BY
  CASE WHEN m.role = 'core' THEN 0 ELSE 1 END,
  u.name;
```

- [ ] **Step 3: Generate the Go layer**

Run: `cd backend && just sqlc`
Expected: regenerates `internal/db/` with no errors; `git status` shows new `internal/db/nights.sql.go` and a modified `internal/db/models.go` (new `Attendance` struct). The generated params types will be `CreateNightParams{GroupID uuid.UUID, ScheduledFor pgtype.Date}`, `GetNightParams{NightID, GroupID uuid.UUID}`, `AddAttendeeParams{PickID, UserID uuid.UUID}`, `RemoveAttendeeParams{PickID, UserID uuid.UUID}`, `ListNightAttendeesParams{GroupID, NightID uuid.UUID}`, and row `ListNightAttendeesRow{ID uuid.UUID, Name string, Role MembershipRole}`.

- [ ] **Step 4: Verify build + existing integration suite**

Run: `cd backend && just build && just test-integration`
Expected: compiles; all existing integration tests pass (the testcontainers harness runs `goose Up`, so a passing run proves `0003` applies and rolls forward cleanly).

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/0003_attendances.sql backend/internal/db/query/nights.sql backend/internal/db/nights.sql.go backend/internal/db/models.go
git commit -m "feat(backend): attendances table + night/attendee queries (sqlc)"
```

---

### Task 2: Backend request/response helpers (pure) + unit tests

**Goal:** Add the pure validation and DTO-mapping helpers for nights, fully unit-tested with no mocks (the codebase's unit tests cover pure functions only; handlers are covered by integration tests in Task 3).

**Files:**
- Create: `backend/nights.go` (pure helpers only this task; handlers added in Task 3)
- Create: `backend/nights_test.go`

**Acceptance Criteria:**
- [ ] `validateCreateNightRequest` parses the ISO date and de-duplicates attendee UUIDs, rejecting malformed input.
- [ ] `parseAttendeeIDs` returns a **non-nil** slice even when empty (the empty-vs-nil distinction the pick order depends on).
- [ ] `toNightResponse` maps a `db.Pick` + attendee rows to the night DTO.
- [ ] `presentIDs` returns a non-nil, possibly-empty `[]uuid.UUID`.

**Verify:** `cd backend && go test -run '^TestNight' ./...` → PASS (and `just check` stays green).

**Steps:**

- [ ] **Step 1: Write the failing unit tests**

Create `backend/nights_test.go`:

```go
package main

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// mustDate parses an ISO date for table-driven tests, failing on a bad literal.
func mustDate(t *testing.T, s string) time.Time {
	t.Helper()
	tm, err := time.Parse("2006-01-02", s)
	if err != nil {
		t.Fatalf("parse date %q: %v", s, err)
	}
	return tm
}

func TestNightCreateRequestValidation(t *testing.T) {
	const a = "a0000000-0000-0000-0000-000000000001"
	const b = "a0000000-0000-0000-0000-000000000002"

	tests := []struct {
		name      string
		req       createNightRequest
		wantErr   bool
		wantCount int // attendee count when valid
	}{
		{name: "valid with attendees", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{a, b}}, wantCount: 2},
		{name: "valid no attendees", req: createNightRequest{ScheduledFor: "2026-06-12"}, wantCount: 0},
		{name: "dedupes attendees", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{a, a, b}}, wantCount: 2},
		{name: "bad date", req: createNightRequest{ScheduledFor: "12-06-2026"}, wantErr: true},
		{name: "empty date", req: createNightRequest{ScheduledFor: ""}, wantErr: true},
		{name: "bad attendee uuid", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{"nope"}}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := validateCreateNightRequest(tt.req)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(parsed.Attendees) != tt.wantCount {
				t.Errorf("attendee count = %d, want %d", len(parsed.Attendees), tt.wantCount)
			}
			if parsed.Attendees == nil {
				t.Errorf("Attendees must be non-nil even when empty")
			}
		})
	}
}

func TestPresentIDsIsNonNilWhenEmpty(t *testing.T) {
	// An attendee-less night must rank NOBODY, so present must be empty-non-nil
	// (encodes as SQL '{}'), never nil (which RankGroupTurn treats as "rank all").
	ids := presentIDs(nil)
	if ids == nil {
		t.Fatalf("presentIDs(nil) = nil, want non-nil empty slice")
	}
	if len(ids) != 0 {
		t.Fatalf("len = %d, want 0", len(ids))
	}
}

func TestToNightResponse(t *testing.T) {
	nightID := uuid.MustParse("b0000000-0000-0000-0000-0000000000aa")
	ada := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	pick := db.Pick{ID: nightID}
	pick.ScheduledFor.Time = mustDate(t, "2026-06-12")
	pick.ScheduledFor.Valid = true

	rows := []db.ListNightAttendeesRow{
		{ID: ada, Name: "Ada", Role: db.MembershipRoleCore},
	}
	got := toNightResponse(pick, rows)
	if got.ID != nightID.String() {
		t.Errorf("ID = %q", got.ID)
	}
	if got.ScheduledFor != "2026-06-12" {
		t.Errorf("ScheduledFor = %q, want 2026-06-12", got.ScheduledFor)
	}
	if len(got.Attendees) != 1 || got.Attendees[0].Name != "Ada" || got.Attendees[0].Role != "core" {
		t.Errorf("attendees = %+v", got.Attendees)
	}
}
```

(The `mustDate` helper and `time` import are already included at the top of the file above.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test -run '^TestNight|^TestPresentIDs|^TestToNightResponse' ./...`
Expected: FAIL — `undefined: createNightRequest`, `validateCreateNightRequest`, `presentIDs`, `toNightResponse`.

- [ ] **Step 3: Write the pure helpers**

Create `backend/nights.go`:

```go
package main

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// createNightRequest is the JSON body of POST /groups/{groupId}/nights.
type createNightRequest struct {
	ScheduledFor string   `json:"scheduledFor"`
	Attendees    []string `json:"attendees"`
}

// parsedCreateNight is a validated createNightRequest. Attendees is deduped,
// first-seen order, and always non-nil (possibly empty).
type parsedCreateNight struct {
	ScheduledFor pgtype.Date
	Attendees    []uuid.UUID
}

// parseAttendeeIDs parses and de-duplicates attendee UUID strings, preserving
// first-seen order. Always returns a non-nil slice. Pure.
func parseAttendeeIDs(raw []string) ([]uuid.UUID, error) {
	seen := make(map[uuid.UUID]bool, len(raw))
	ids := make([]uuid.UUID, 0, len(raw))
	for _, s := range raw {
		id, err := uuid.Parse(s)
		if err != nil {
			return nil, fmt.Errorf("invalid attendee id")
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	return ids, nil
}

// validateCreateNightRequest validates a decoded body: scheduledFor must be an
// ISO (YYYY-MM-DD) date and every attendee must be a UUID. Pure — no DB, no clock.
func validateCreateNightRequest(req createNightRequest) (parsedCreateNight, error) {
	t, err := time.Parse("2006-01-02", req.ScheduledFor)
	if err != nil {
		return parsedCreateNight{}, fmt.Errorf("invalid scheduledFor")
	}
	attendees, err := parseAttendeeIDs(req.Attendees)
	if err != nil {
		return parsedCreateNight{}, err
	}
	return parsedCreateNight{
		ScheduledFor: pgtype.Date{Time: t, Valid: true},
		Attendees:    attendees,
	}, nil
}

// attendee is one person recorded as present on a night.
type attendee struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

// nightResponse is the JSON shape for a night and its current attendees.
type nightResponse struct {
	ID           string     `json:"id"`
	ScheduledFor string     `json:"scheduledFor"`
	Attendees    []attendee `json:"attendees"`
}

// toNightResponse maps a night row + attendee rows to the night DTO. Attendees
// is always non-nil so an empty list encodes as [] rather than null.
func toNightResponse(p db.Pick, rows []db.ListNightAttendeesRow) nightResponse {
	attendees := make([]attendee, 0, len(rows))
	for _, r := range rows {
		attendees = append(attendees, attendee{
			ID:   r.ID.String(),
			Name: r.Name,
			Role: string(r.Role),
		})
	}
	return nightResponse{
		ID:           p.ID.String(),
		ScheduledFor: p.ScheduledFor.Time.Format("2006-01-02"),
		Attendees:    attendees,
	}
}

// presentIDs extracts attendee user IDs as a NON-NIL (possibly empty) slice to
// pass as RankGroupTurn's present set. Empty (not nil) makes the ranking exclude
// everyone — distinct from nil, which RankGroupTurn treats as "rank all core".
func presentIDs(rows []db.ListNightAttendeesRow) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	return ids
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test -run '^TestNight|^TestPresentIDs|^TestToNightResponse' ./... && just check`
Expected: PASS; `just check` (gofmt + vet + build + unit tests) green.

- [ ] **Step 5: Commit**

```bash
git add backend/nights.go backend/nights_test.go
git commit -m "feat(backend): pure night request/response helpers + unit tests"
```

---

### Task 3: Backend night handlers + routing + integration tests

**Goal:** Add the five HTTP handlers, the `nightStore` interface, wire the routes in `main.go`, and cover the wired handlers with testcontainers integration tests.

**Files:**
- Modify: `backend/nights.go` (append handlers + `nightStore`)
- Create: `backend/nights_integration_test.go`
- Modify: `backend/main.go:46-52` (register routes)

**Acceptance Criteria:**
- [ ] `POST /groups/{groupId}/nights` creates a night (+ initial attendees) → `201` with the night DTO.
- [ ] `POST .../attendees` (add) and `DELETE .../attendees/{userId}` (remove) return the updated night DTO; both idempotent.
- [ ] `GET .../nights/{nightId}` returns the night DTO; `GET .../nights/{nightId}/turn` returns the core pick order over attendees.
- [ ] Errors: `400` malformed UUID/date, `404` unknown night, `422` attendee not a member.
- [ ] The pick order excludes a core member who isn't attending and excludes guest attendees.

**Verify:** `cd backend && just check && just test-integration` → all green.

**Steps:**

- [ ] **Step 1: Write the failing integration test**

Create `backend/nights_integration_test.go` (reuses `startPostgres`/`seedFixtures`/`seededGroup` from `roster_integration_test.go`; seed has Ada/Blake/Cleo active core, Frankie active guest, Zed inactive core):

```go
//go:build integration

package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestNightAttendanceIntegration(t *testing.T) {
	pool := startPostgres(t)
	seedFixtures(t, pool)

	mux := http.NewServeMux()
	q := db.New(pool)
	mux.Handle("POST /groups/{groupId}/nights", createNightHandler(q))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}", nightDetailHandler(q))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}/turn", nightTurnHandler(q))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/attendees", addAttendeeHandler(q))
	mux.Handle("DELETE /groups/{groupId}/nights/{nightId}/attendees/{userId}", removeAttendeeHandler(q))

	const (
		ada     = "a0000000-0000-0000-0000-000000000001"
		blake   = "a0000000-0000-0000-0000-000000000002"
		cleo    = "a0000000-0000-0000-0000-000000000003"
		frankie = "a0000000-0000-0000-0000-000000000006" // active guest
		unknown = "a0000000-0000-0000-0000-0000000000ff"
	)

	do := func(t *testing.T, method, path, body string) (int, []byte) {
		t.Helper()
		rec := httptest.NewRecorder()
		var r *http.Request
		if body == "" {
			r = httptest.NewRequest(method, path, nil)
		} else {
			r = httptest.NewRequest(method, path, bytes.NewBufferString(body))
		}
		mux.ServeHTTP(rec, r)
		return rec.Code, rec.Body.Bytes()
	}

	createNight := func(t *testing.T, body string) nightResponse {
		t.Helper()
		code, b := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", body)
		if code != http.StatusCreated {
			t.Fatalf("create night status = %d, want 201 (body %s)", code, b)
		}
		var n nightResponse
		if err := json.Unmarshal(b, &n); err != nil {
			t.Fatalf("decode night: %v", err)
		}
		return n
	}

	turn := func(t *testing.T, nightID string) []turnResponse {
		t.Helper()
		code, b := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/"+nightID+"/turn", "")
		if code != http.StatusOK {
			t.Fatalf("turn status = %d, want 200 (body %s)", code, b)
		}
		var got []turnResponse
		if err := json.Unmarshal(b, &got); err != nil {
			t.Fatalf("decode turn: %v", err)
		}
		return got
	}

	names := func(rows []turnResponse) []string {
		out := make([]string, len(rows))
		for i, r := range rows {
			out[i] = r.Name
		}
		return out
	}

	t.Run("pick order ranks attendees and excludes absent core", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`","`+blake+`"]}`)
		if len(n.Attendees) != 2 {
			t.Fatalf("attendees = %+v, want 2", n.Attendees)
		}
		got := names(turn(t, n.ID))
		// Ada (rotation 1) and Blake (rotation 2), both served 0; Cleo absent.
		if len(got) != 2 || got[0] != "Ada" || got[1] != "Blake" {
			t.Fatalf("order = %v, want [Ada Blake]", got)
		}
	})

	t.Run("guest attendee is recorded but absent from the pick order", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`","`+frankie+`"]}`)
		// Frankie is recorded with role guest...
		var sawGuest bool
		for _, a := range n.Attendees {
			if a.Name == "Frankie" && a.Role == "guest" {
				sawGuest = true
			}
		}
		if !sawGuest {
			t.Fatalf("attendees = %+v, want Frankie as guest", n.Attendees)
		}
		// ...but the pick order is core-only.
		if got := names(turn(t, n.ID)); len(got) != 1 || got[0] != "Ada" {
			t.Fatalf("order = %v, want [Ada]", got)
		}
	})

	t.Run("add then remove attendee changes the order", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`"]}`)
		if code, b := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+n.ID+"/attendees", `{"userId":"`+blake+`"}`); code != http.StatusCreated {
			t.Fatalf("add status = %d, want 201 (body %s)", code, b)
		}
		if got := names(turn(t, n.ID)); len(got) != 2 {
			t.Fatalf("after add: order = %v, want 2", got)
		}
		if code, _ := do(t, http.MethodDelete, "/groups/"+seededGroup+"/nights/"+n.ID+"/attendees/"+blake, ""); code != http.StatusOK {
			t.Fatalf("remove status = %d, want 200", code)
		}
		if got := names(turn(t, n.ID)); len(got) != 1 || got[0] != "Ada" {
			t.Fatalf("after remove: order = %v, want [Ada]", got)
		}
	})

	t.Run("empty night ranks nobody", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12"}`)
		if got := turn(t, n.ID); len(got) != 0 {
			t.Fatalf("order = %+v, want []", got)
		}
	})

	t.Run("add non-member yields 422", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12"}`)
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+n.ID+"/attendees", `{"userId":"`+unknown+`"}`); code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want 422", code)
		}
	})

	t.Run("unknown night yields 404", func(t *testing.T) {
		missing := "b0000000-0000-0000-0000-0000000000ee"
		if code, _ := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/"+missing, ""); code != http.StatusNotFound {
			t.Fatalf("detail status = %d, want 404", code)
		}
		if code, _ := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/"+missing+"/turn", ""); code != http.StatusNotFound {
			t.Fatalf("turn status = %d, want 404", code)
		}
	})

	t.Run("malformed ids yield 400", func(t *testing.T) {
		if code, _ := do(t, http.MethodPost, "/groups/not-a-uuid/nights", `{"scheduledFor":"2026-06-12"}`); code != http.StatusBadRequest {
			t.Fatalf("bad group status = %d, want 400", code)
		}
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", `{"scheduledFor":"nope"}`); code != http.StatusBadRequest {
			t.Fatalf("bad date status = %d, want 400", code)
		}
	})
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && just test-integration`
Expected: FAIL to compile — `undefined: createNightHandler`, `nightDetailHandler`, `nightTurnHandler`, `addAttendeeHandler`, `removeAttendeeHandler`.

- [ ] **Step 3: Append the handlers + store to `backend/nights.go`**

Add these imports to `nights.go` (it currently imports `fmt`, `time`, `uuid`, `pgtype`, `db`): add `context`, `encoding/json`, `errors`, `log`, `net/http`, and `github.com/jackc/pgx/v5`. Then append:

```go
// nightStore is the subset of *db.Queries the night handlers need; the real
// *db.Queries satisfies it, so no mock is ever written (same pattern as
// turnStore/pickStore/memberStore).
type nightStore interface {
	CreateNight(ctx context.Context, arg db.CreateNightParams) (db.Pick, error)
	GetNight(ctx context.Context, arg db.GetNightParams) (db.Pick, error)
	AddAttendee(ctx context.Context, arg db.AddAttendeeParams) error
	RemoveAttendee(ctx context.Context, arg db.RemoveAttendeeParams) error
	ListNightAttendees(ctx context.Context, arg db.ListNightAttendeesParams) ([]db.ListNightAttendeesRow, error)
	GetGroupMember(ctx context.Context, arg db.GetGroupMemberParams) (db.GetGroupMemberRow, error)
	RankGroupTurn(ctx context.Context, arg db.RankGroupTurnParams) ([]db.RankGroupTurnRow, error)
}

// attendeeRequest is the JSON body of POST .../nights/{nightId}/attendees.
type attendeeRequest struct {
	UserID string `json:"userId"`
}

// parseGroupAndNight validates the {groupId} and {nightId} path segments as
// UUIDs, writing a 400 and returning ok=false on either malformed value.
func parseGroupAndNight(w http.ResponseWriter, r *http.Request) (gid, nightID uuid.UUID, ok bool) {
	gid, err := parseGroupID(r.PathValue("groupId"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid group id")
		return uuid.UUID{}, uuid.UUID{}, false
	}
	nightID, err = uuid.Parse(r.PathValue("nightId"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid night id")
		return uuid.UUID{}, uuid.UUID{}, false
	}
	return gid, nightID, true
}

// ensureNight confirms a night exists in this group, mapping a miss to 404 and
// any other error to 500. ok=false means a response was already written.
func ensureNight(w http.ResponseWriter, r *http.Request, store nightStore, gid, nightID uuid.UUID) bool {
	if _, err := store.GetNight(r.Context(), db.GetNightParams{NightID: nightID, GroupID: gid}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "night not found")
			return false
		}
		internalError(w, gid, "get night", err)
		return false
	}
	return true
}

// writeNightDTO loads the night + its attendees and encodes the DTO with the
// given status. Used by create/add/remove/detail so the client always gets the
// current attendee list back.
func writeNightDTO(w http.ResponseWriter, r *http.Request, store nightStore, gid, nightID uuid.UUID, code int) {
	night, err := store.GetNight(r.Context(), db.GetNightParams{NightID: nightID, GroupID: gid})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "night not found")
			return
		}
		internalError(w, gid, "get night", err)
		return
	}
	rows, err := store.ListNightAttendees(r.Context(), db.ListNightAttendeesParams{GroupID: gid, NightID: nightID})
	if err != nil {
		internalError(w, gid, "list night attendees", err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(toNightResponse(night, rows)); err != nil {
		log.Printf("encode night response (%s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID
	}
}

// requireMember validates that uid is a member of the group, writing a 422 on a
// miss and 500 on any other error. ok=false means a response was already written.
func requireMember(w http.ResponseWriter, r *http.Request, store nightStore, gid, uid uuid.UUID) bool {
	if _, err := store.GetGroupMember(r.Context(), db.GetGroupMemberParams{GroupID: gid, UserID: uid}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusUnprocessableEntity, "attendee is not a member of this group")
			return false
		}
		internalError(w, gid, "get group member", err)
		return false
	}
	return true
}

// createNightHandler serves POST /groups/{groupId}/nights. A night is a picks
// row with picker_id NULL. We validate every initial attendee is a member
// BEFORE any write (so bad input fails before we create anything), then insert
// the night and attendees without a transaction — like joinMemberHandler, a
// partially-populated planned night is inert (picker NULL → no standings impact)
// and a retried add is idempotent.
func createNightHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, err := parseGroupID(r.PathValue("groupId"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid group id")
			return
		}
		var req createNightRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		parsed, err := validateCreateNightRequest(req)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		ctx := r.Context()
		for _, uid := range parsed.Attendees {
			if !requireMember(w, r, store, gid, uid) {
				return
			}
		}
		night, err := store.CreateNight(ctx, db.CreateNightParams{GroupID: gid, ScheduledFor: parsed.ScheduledFor})
		if err != nil {
			internalError(w, gid, "create night", err)
			return
		}
		for _, uid := range parsed.Attendees {
			if err := store.AddAttendee(ctx, db.AddAttendeeParams{PickID: night.ID, UserID: uid}); err != nil {
				internalError(w, gid, "add attendee", err)
				return
			}
		}
		writeNightDTO(w, r, store, gid, night.ID, http.StatusCreated)
	}
}

// addAttendeeHandler serves POST /groups/{groupId}/nights/{nightId}/attendees.
func addAttendeeHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := parseGroupAndNight(w, r)
		if !ok {
			return
		}
		var req attendeeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		uid, err := uuid.Parse(req.UserID)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid user id")
			return
		}
		if !ensureNight(w, r, store, gid, nightID) {
			return
		}
		if !requireMember(w, r, store, gid, uid) {
			return
		}
		if err := store.AddAttendee(r.Context(), db.AddAttendeeParams{PickID: nightID, UserID: uid}); err != nil {
			internalError(w, gid, "add attendee", err)
			return
		}
		writeNightDTO(w, r, store, gid, nightID, http.StatusCreated)
	}
}

// removeAttendeeHandler serves DELETE /groups/{groupId}/nights/{nightId}/attendees/{userId}.
// Idempotent: removing a non-attendee still returns 200 with the current night.
func removeAttendeeHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := parseGroupAndNight(w, r)
		if !ok {
			return
		}
		uid, err := uuid.Parse(r.PathValue("userId"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid user id")
			return
		}
		if !ensureNight(w, r, store, gid, nightID) {
			return
		}
		if err := store.RemoveAttendee(r.Context(), db.RemoveAttendeeParams{PickID: nightID, UserID: uid}); err != nil {
			internalError(w, gid, "remove attendee", err)
			return
		}
		writeNightDTO(w, r, store, gid, nightID, http.StatusOK)
	}
}

// nightDetailHandler serves GET /groups/{groupId}/nights/{nightId}.
func nightDetailHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := parseGroupAndNight(w, r)
		if !ok {
			return
		}
		writeNightDTO(w, r, store, gid, nightID, http.StatusOK)
	}
}

// nightTurnHandler serves GET /groups/{groupId}/nights/{nightId}/turn — the core
// pick order over the night's attendees. Reuses RankGroupTurn with the attendee
// IDs as a non-nil present set (empty present = rank nobody).
func nightTurnHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, nightID, ok := parseGroupAndNight(w, r)
		if !ok {
			return
		}
		ctx := r.Context()
		if !ensureNight(w, r, store, gid, nightID) {
			return
		}
		rows, err := store.ListNightAttendees(ctx, db.ListNightAttendeesParams{GroupID: gid, NightID: nightID})
		if err != nil {
			internalError(w, gid, "list night attendees", err)
			return
		}
		ranked, err := store.RankGroupTurn(ctx, db.RankGroupTurnParams{GroupID: gid, Present: presentIDs(rows)})
		if err != nil {
			internalError(w, gid, "rank group turn", err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(toTurnResponses(ranked)); err != nil {
			log.Printf("encode turn response (%s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID
		}
	}
}
```

(`internalError`, `writeJSONError`, `parseGroupID`, and `toTurnResponses` already exist in `membership.go`/`roster.go`/`turn.go`; reuse them.)

- [ ] **Step 4: Register the routes in `main.go`**

In `backend/main.go`, after the existing `mux.Handle(...)` block (around line 52, after the `promote` route), add:

```go
	mux.Handle("POST /groups/{groupId}/nights", createNightHandler(queries))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}", nightDetailHandler(queries))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}/turn", nightTurnHandler(queries))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/attendees", addAttendeeHandler(queries))
	mux.Handle("DELETE /groups/{groupId}/nights/{nightId}/attendees/{userId}", removeAttendeeHandler(queries))
```

- [ ] **Step 5: Run unit + integration suites**

Run: `cd backend && just check && just test-integration`
Expected: `just check` green; the new `TestNightAttendanceIntegration` subtests all pass; existing suites unaffected.

- [ ] **Step 6: Commit**

```bash
git add backend/nights.go backend/nights_integration_test.go backend/main.go
git commit -m "feat(backend): night attendance + pick-order endpoints"
```

---

### Task 4: Mobile nights API client + tests

**Goal:** Add `lib/nights.ts` (fetch + validation, reusing `parseTurn`) with pure unit tests and a real-local-server integration test, mirroring `lib/picks.ts` + its tests.

**Files:**
- Create: `mobile/lib/nights.ts`
- Create: `mobile/lib/nights.test.ts`
- Create: `mobile/lib/nights.integration.test.ts`

**Acceptance Criteria:**
- [ ] `parseNight` validates the night shape (incl. attendee `role`) and throws on bad shapes.
- [ ] `createNight`/`getNight`/`addAttendee`/`removeAttendee` hit the right method/path/body and return a parsed `Night`.
- [ ] `getNightTurn` returns a parsed `TurnMember[]` (via the shared `parseTurn`).
- [ ] All client functions throw `request failed: <status>` on non-2xx.

**Verify:** `cd mobile && node --import tsx --test lib/nights.test.ts lib/nights.integration.test.ts` → all pass; `just check` green.

**Steps:**

- [ ] **Step 1: Write the failing unit tests**

Create `mobile/lib/nights.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseNight } from "./nights";

const valid = {
  id: "n1",
  scheduledFor: "2026-06-12",
  attendees: [
    { id: "u1", name: "Ada", role: "core" },
    { id: "u6", name: "Frankie", role: "guest" },
  ],
};

test("parses a valid night with attendees", () => {
  const n = parseNight(valid);
  assert.equal(n.id, "n1");
  assert.equal(n.scheduledFor, "2026-06-12");
  assert.equal(n.attendees.length, 2);
  assert.equal(n.attendees[1].role, "guest");
});

test("parses a night with no attendees", () => {
  const n = parseNight({ id: "n1", scheduledFor: "2026-06-12", attendees: [] });
  assert.deepEqual(n.attendees, []);
});

test("rejects a bad attendee role", () => {
  assert.throws(
    () => parseNight({ ...valid, attendees: [{ id: "u1", name: "Ada", role: "admin" }] }),
    /role/,
  );
});

test("rejects non-array attendees", () => {
  assert.throws(() => parseNight({ id: "n1", scheduledFor: "2026-06-12", attendees: {} }), /attendees/);
});

test("rejects a non-object", () => {
  assert.throws(() => parseNight(null), /night object/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd mobile && node --import tsx --test lib/nights.test.ts`
Expected: FAIL — cannot find module `./nights`.

- [ ] **Step 3: Write `lib/nights.ts`**

Create `mobile/lib/nights.ts`:

```ts
import { parseTurn, type TurnMember } from "./turn";

export type Attendee = {
  id: string;
  name: string;
  role: "core" | "guest";
};

export type Night = {
  id: string;
  scheduledFor: string;
  attendees: Attendee[];
};

function parseAttendee(raw: unknown, index: number): Attendee {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`attendee ${index}: expected an object`);
  }
  const { id, name, role } = raw as Record<string, unknown>;
  if (typeof id !== "string") {
    throw new Error(`attendee ${index}: id must be a string`);
  }
  if (typeof name !== "string") {
    throw new Error(`attendee ${index}: name must be a string`);
  }
  if (role !== "core" && role !== "guest") {
    throw new Error(`attendee ${index}: role must be "core" or "guest"`);
  }
  return { id, name, role };
}

// parseNight validates an untrusted JSON payload and returns a typed Night,
// throwing a descriptive error if the shape is wrong.
export function parseNight(raw: unknown): Night {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("expected a night object");
  }
  const { id, scheduledFor, attendees } = raw as Record<string, unknown>;
  if (typeof id !== "string") {
    throw new Error("night: id must be a string");
  }
  if (typeof scheduledFor !== "string") {
    throw new Error("night: scheduledFor must be a string");
  }
  if (!Array.isArray(attendees)) {
    throw new Error("night: attendees must be an array");
  }
  return { id, scheduledFor, attendees: attendees.map(parseAttendee) };
}

async function fetchNight(url: string, init?: RequestInit): Promise<Night> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  return parseNight(await res.json());
}

// createNight plans a night for scheduledFor (ISO YYYY-MM-DD) with an optional
// initial attendee list of user IDs.
export function createNight(
  baseUrl: string,
  groupId: string,
  scheduledFor: string,
  attendees: string[] = [],
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(`${baseUrl}/groups/${groupId}/nights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scheduledFor, attendees }),
    signal,
  });
}

export function getNight(
  baseUrl: string,
  groupId: string,
  nightId: string,
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(`${baseUrl}/groups/${groupId}/nights/${nightId}`, { signal });
}

export function addAttendee(
  baseUrl: string,
  groupId: string,
  nightId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(`${baseUrl}/groups/${groupId}/nights/${nightId}/attendees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
    signal,
  });
}

export function removeAttendee(
  baseUrl: string,
  groupId: string,
  nightId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<Night> {
  return fetchNight(
    `${baseUrl}/groups/${groupId}/nights/${nightId}/attendees/${userId}`,
    { method: "DELETE", signal },
  );
}

// getNightTurn loads the core pick order for a night (element 0 is the picker).
export async function getNightTurn(
  baseUrl: string,
  groupId: string,
  nightId: string,
  signal?: AbortSignal,
): Promise<TurnMember[]> {
  const res = await fetch(`${baseUrl}/groups/${groupId}/nights/${nightId}/turn`, { signal });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  return parseTurn(await res.json());
}
```

- [ ] **Step 4: Write the integration test**

Create `mobile/lib/nights.integration.test.ts` (same real-local-server pattern as `picks.integration.test.ts`):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createNight, addAttendee, removeAttendee, getNightTurn, type Night } from "./nights";

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

async function startServer(handler: Handler): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr === null || typeof addr === "string") {
    throw new Error("server has no port");
  }
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

const GROUP = "11111111-1111-1111-1111-111111111111";
const NIGHT = "n1";
const ADA = "a0000000-0000-0000-0000-000000000001";

const night: Night = {
  id: NIGHT,
  scheduledFor: "2026-06-12",
  attendees: [{ id: ADA, name: "Ada", role: "core" }],
};

function collect(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

test("createNight posts scheduledFor + attendees and parses the night", async () => {
  let path = "";
  let method = "";
  let body = "";
  const server = await startServer(async (req, res) => {
    path = req.url ?? "";
    method = req.method ?? "";
    body = await collect(req);
    res.statusCode = 201;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(night));
  });
  try {
    const got = await createNight(server.url, GROUP, "2026-06-12", [ADA]);
    assert.equal(method, "POST");
    assert.equal(path, `/groups/${GROUP}/nights`);
    assert.deepEqual(JSON.parse(body), { scheduledFor: "2026-06-12", attendees: [ADA] });
    assert.deepEqual(got, night);
  } finally {
    await server.close();
  }
});

test("addAttendee posts the userId to the attendees path", async () => {
  let path = "";
  let method = "";
  let body = "";
  const server = await startServer(async (req, res) => {
    path = req.url ?? "";
    method = req.method ?? "";
    body = await collect(req);
    res.statusCode = 201;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(night));
  });
  try {
    await addAttendee(server.url, GROUP, NIGHT, ADA);
    assert.equal(method, "POST");
    assert.equal(path, `/groups/${GROUP}/nights/${NIGHT}/attendees`);
    assert.deepEqual(JSON.parse(body), { userId: ADA });
  } finally {
    await server.close();
  }
});

test("removeAttendee issues DELETE to the attendee path", async () => {
  let path = "";
  let method = "";
  const server = await startServer((req, res) => {
    path = req.url ?? "";
    method = req.method ?? "";
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ...night, attendees: [] }));
  });
  try {
    const got = await removeAttendee(server.url, GROUP, NIGHT, ADA);
    assert.equal(method, "DELETE");
    assert.equal(path, `/groups/${GROUP}/nights/${NIGHT}/attendees/${ADA}`);
    assert.deepEqual(got.attendees, []);
  } finally {
    await server.close();
  }
});

test("getNightTurn parses the ranking array", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ id: ADA, name: "Ada", role: "core", servedCount: 0, lastPickedOn: null }]));
  });
  try {
    const order = await getNightTurn(server.url, GROUP, NIGHT);
    assert.equal(order.length, 1);
    assert.equal(order[0].name, "Ada");
  } finally {
    await server.close();
  }
});

test("throws on a non-2xx response", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 422;
    res.end("nope");
  });
  try {
    await assert.rejects(createNight(server.url, GROUP, "2026-06-12", []), /request failed: 422/);
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 5: Run tests + full mobile check**

Run: `cd mobile && node --import tsx --test lib/nights.test.ts lib/nights.integration.test.ts && just check`
Expected: all tests pass; lint + typecheck + full test suite green.

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/nights.ts mobile/lib/nights.test.ts mobile/lib/nights.integration.test.ts
git commit -m "feat(mobile): nights API client (create/attend/pick-order) + tests"
```

---

### Task 5: Mobile night screen + navigation

**Goal:** Add an expo-router `night` screen that creates a night for today, lets the user toggle attendees (reusing `fetchMembers`), and shows the resulting pick order; register the route and link to it from the turn screen.

**Files:**
- Create: `mobile/app/night.tsx`
- Modify: `mobile/app/_layout.tsx` (add `<Stack.Screen name="night" .../>`)
- Modify: `mobile/app/index.tsx` (add a `<Link href="/night">` header action)

**Acceptance Criteria:**
- [ ] Tapping "Start tonight's night" creates a night and reveals the attendee toggles.
- [ ] Each member row toggles attendance (add/remove) and the pick order updates from the returned night.
- [ ] The pick order lists core attendees with element 0 badged "Tonight's pick"; guests are shown as "also present" and never in the order.
- [ ] `just check` (lint + typecheck + test) is green.

**Verify:** `cd mobile && just check` → green. (Manual smoke optional: `just start` per the dev loop.)

**Steps:**

- [ ] **Step 1: Write the night screen**

Create `mobile/app/night.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Button,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";

import { resolveApiBaseUrl } from "../lib/api";
import { todayLocalISO } from "../lib/date";
import { fetchMembers, type Member } from "../lib/members";
import {
  addAttendee,
  createNight,
  getNightTurn,
  removeAttendee,
  type Night,
} from "../lib/nights";
import { type TurnMember } from "../lib/turn";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});
const GROUP_ID = "11111111-1111-1111-1111-111111111111";

export default function NightScreen() {
  const [members, setMembers] = useState<Member[]>([]);
  const [night, setNight] = useState<Night | null>(null);
  const [order, setOrder] = useState<TurnMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // The member id with an action in flight, or "create" while creating.
  const [busy, setBusy] = useState<string | null>(null);

  // Load the roster (everyone, so guests can be added too).
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setMembers(await fetchMembers(API_URL, GROUP_ID, controller.signal));
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "failed to load members");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  const attendeeIds = useMemo(
    () => new Set((night?.attendees ?? []).map((a) => a.id)),
    [night],
  );

  const refreshOrder = useCallback(async (nightId: string) => {
    setOrder(await getNightTurn(API_URL, GROUP_ID, nightId));
  }, []);

  const onCreate = useCallback(async () => {
    if (busy !== null) {
      return;
    }
    setBusy("create");
    setActionError(null);
    try {
      const created = await createNight(API_URL, GROUP_ID, todayLocalISO());
      setNight(created);
      await refreshOrder(created.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "failed to create night");
    } finally {
      setBusy(null);
    }
  }, [busy, refreshOrder]);

  const onToggle = useCallback(
    async (member: Member) => {
      if (night === null || busy !== null) {
        return;
      }
      setBusy(member.id);
      setActionError(null);
      try {
        const updated = attendeeIds.has(member.id)
          ? await removeAttendee(API_URL, GROUP_ID, night.id, member.id)
          : await addAttendee(API_URL, GROUP_ID, night.id, member.id);
        setNight(updated);
        await refreshOrder(updated.id);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "failed to update attendance");
      } finally {
        setBusy(null);
      }
    },
    [night, busy, attendeeIds, refreshOrder],
  );

  if (loading) {
    return <ActivityIndicator style={styles.center} size="large" />;
  }
  if (error !== null) {
    return <Text style={[styles.center, styles.error]}>{`Couldn't load members: ${error}`}</Text>;
  }

  const guestsPresent = (night?.attendees ?? []).filter((a) => a.role === "guest");

  return (
    <View style={styles.container}>
      {night === null ? (
        <View style={styles.createRow}>
          <Text style={styles.hint}>Start a night to record who's here.</Text>
          <Button title="Start tonight's night" onPress={onCreate} disabled={busy !== null} />
        </View>
      ) : (
        <>
          <Text style={styles.heading}>{`Night of ${night.scheduledFor}`}</Text>
          {actionError !== null && <Text style={[styles.banner, styles.error]}>{actionError}</Text>}

          <Text style={styles.section}>Who's here?</Text>
          <FlatList
            data={members}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => {
              const present = attendeeIds.has(item.id);
              const isBusy = busy === item.id;
              return (
                <Pressable
                  onPress={() => onToggle(item)}
                  disabled={busy !== null}
                  style={({ pressed }) => [styles.row, present && styles.rowPresent, pressed && styles.rowPressed]}
                >
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.tag}>{isBusy ? "…" : present ? "✓ here" : item.role}</Text>
                </Pressable>
              );
            }}
            ListFooterComponent={
              <View style={styles.orderBlock}>
                <Text style={styles.section}>Pick order</Text>
                {order.length === 0 ? (
                  <Text style={styles.hint}>No core members here yet.</Text>
                ) : (
                  order.map((m, i) => (
                    <View key={m.id} style={[styles.orderRow, i === 0 && styles.pickerRow]}>
                      <Text style={styles.name}>{`${i + 1}. ${m.name}`}</Text>
                      {i === 0 && <Text style={styles.badge}>Tonight's pick</Text>}
                    </View>
                  ))
                )}
                {guestsPresent.length > 0 && (
                  <Text style={styles.hint}>
                    {`Also present: ${guestsPresent.map((g) => g.name).join(", ")}`}
                  </Text>
                )}
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  center: { marginTop: 32, textAlign: "center" },
  error: { color: "#b00020" },
  banner: { paddingVertical: 8, textAlign: "center" },
  createRow: { marginTop: 32, gap: 12, alignItems: "center" },
  hint: { fontSize: 14, color: "#666" },
  heading: { fontSize: 20, fontWeight: "600", paddingVertical: 12 },
  section: { fontSize: 14, fontWeight: "600", color: "#666", textTransform: "uppercase", marginTop: 12, marginBottom: 4 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
  },
  rowPresent: { backgroundColor: "#eef6ff", borderRadius: 8, paddingHorizontal: 8 },
  rowPressed: { opacity: 0.6 },
  name: { fontSize: 18 },
  tag: { fontSize: 12, fontWeight: "600", color: "#666", textTransform: "uppercase" },
  orderBlock: { paddingTop: 8 },
  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  pickerRow: { backgroundColor: "#eef6ff", borderRadius: 8, paddingHorizontal: 8 },
  badge: { fontSize: 12, fontWeight: "600", color: "#0b66c3", textTransform: "uppercase" },
});
```

- [ ] **Step 2: Register the route in `_layout.tsx`**

In `mobile/app/_layout.tsx`, add a screen inside `<Stack>` after the `manage` screen:

```tsx
        <Stack.Screen name="night" options={{ title: "Tonight" }} />
```

- [ ] **Step 3: Link to it from the turn screen**

In `mobile/app/index.tsx`, add a second link next to the existing "Manage members →" link. Replace the single `<Link>` (around lines 88–90) with:

```tsx
      <View style={styles.links}>
        <Link href="/night" style={styles.manageLink}>
          Tonight →
        </Link>
        <Link href="/manage" style={styles.manageLink}>
          Manage members →
        </Link>
      </View>
```

And add a `links` style to the `StyleSheet.create({ ... })` in `index.tsx`:

```tsx
  links: { flexDirection: "row", justifyContent: "flex-end", gap: 20 },
```

- [ ] **Step 4: Verify lint + typecheck + tests**

Run: `cd mobile && just check`
Expected: lint clean, typecheck passes (no TS errors in `night.tsx`/`index.tsx`), all tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/night.tsx mobile/app/_layout.tsx mobile/app/index.tsx
git commit -m "feat(mobile): night screen — attendance toggles + pick order"
```

---

## Self-review notes (addressed)

- **Spec coverage:** migration + `attendances` (Task 1); all five endpoints + DTO with attendee `name`/`role` (Tasks 2–3); pick order reuses `RankGroupTurn` and the empty-vs-nil present set is unit- and integration-tested (Tasks 2–3); guest-recorded-not-ranked and skip-via-whole-list verified in integration tests (Task 3); mobile client + screen reusing `fetchMembers`/`parseTurn` (Tasks 4–5). Slice 2 is intentionally out of scope.
- **Transaction note:** spec said "one transaction" for create-night; the plan implements validate-first + sequential inserts (no tx) to match `joinMemberHandler`'s documented precedent (orphan/partial night is inert). External contract (`attendees?`) is unchanged.
- **Type consistency:** `nightStore` methods match the sqlc-generated `*Params`/`*Row` names from Task 1; `presentIDs`/`toNightResponse` signatures match their unit tests; `Night`/`Attendee` TS types match `parseNight` and the screen's usage.
```
