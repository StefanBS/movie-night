# Membership Churn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the write path for core-membership churn — join, leave, return, and guest→core promotion — keeping the rotation fair via baseline seeding, wired to a new mobile manage-members screen.

**Architecture:** Four idempotent action endpoints under `POST /groups/{groupId}/members[/{userId}/...]`. A membership is "in the rotation" iff `status=active AND role=core`; entering it triggers a pure baseline-seed (`max(0, round(avg) − existingCredited)`) computed so the entrant's *total* served-count equals the active-core average. Backend mirrors `picks.go` (pure helpers + a one-method-per-op store interface, no mocks). Mobile adds the four write ops to `lib/members.ts`, migrates navigation to expo-router, and adds `app/manage.tsx`.

**Tech Stack:** Go 1.26 (stdlib `net/http`, sqlc, pgx/v5, goose, testcontainers); Expo SDK 54 / React Native (TypeScript, expo-router, `node:test` via `tsx`).

**Spec:** `docs/superpowers/specs/2026-06-05-membership-churn-design.md`

**Note on the spec:** the spec lists `experiments.typedRoutes`. This plan enables it and adds the matching `tsconfig.json` `include` so `just typecheck` resolves the generated route types.

---

### Task 1: Churn sqlc queries + regenerate

**Goal:** Add every SQL query the write path needs in a new `members.sql`, and regenerate the sqlc db package so `db.Queries` gains the new methods + param/row types.

**Files:**
- Create: `backend/internal/db/query/members.sql`
- Generated (do NOT hand-edit): `backend/internal/db/members.sql.go`

**Acceptance Criteria:**
- [ ] `just sqlc` regenerates cleanly and produces `internal/db/members.sql.go`
- [ ] `db.Queries` gains `CreateUser`, `InsertMembership`, `GetGroupMember`, `DeactivateMembership`, `ReactivateMembership`, `PromoteMembership`, `AverageServedCount`, `MemberCreditedCount`, `MaxRotationPosition`
- [ ] `go build ./...` succeeds

**Verify:** `cd backend && just sqlc && go build ./...` → builds clean; `git status` shows new `internal/db/query/members.sql` and `internal/db/members.sql.go`.

**Steps:**

- [ ] **Step 1: Create the query file**

`backend/internal/db/query/members.sql`:

```sql
-- name: CreateUser :one
INSERT INTO users (name) VALUES ($1)
RETURNING id, name, letterboxd_user, created_at;

-- name: InsertMembership :one
INSERT INTO memberships (group_id, user_id, role, status, baseline_picks, rotation_position)
VALUES (sqlc.arg(group_id), sqlc.arg(user_id), sqlc.arg(role), sqlc.arg(status), sqlc.arg(baseline_picks), sqlc.arg(rotation_position))
RETURNING id, group_id, user_id, role, status, baseline_picks, rotation_position, joined_at, left_at;

-- name: GetGroupMember :one
SELECT u.id AS user_id, u.name, m.role, m.status, m.baseline_picks
FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE m.group_id = sqlc.arg(group_id) AND m.user_id = sqlc.arg(user_id);

-- name: DeactivateMembership :one
UPDATE memberships
SET status = 'inactive', left_at = now()
WHERE group_id = sqlc.arg(group_id) AND user_id = sqlc.arg(user_id)
RETURNING id, group_id, user_id, role, status, baseline_picks, rotation_position, joined_at, left_at;

-- name: ReactivateMembership :one
UPDATE memberships
SET status = 'active', left_at = NULL, baseline_picks = sqlc.arg(baseline_picks)
WHERE group_id = sqlc.arg(group_id) AND user_id = sqlc.arg(user_id)
RETURNING id, group_id, user_id, role, status, baseline_picks, rotation_position, joined_at, left_at;

-- name: PromoteMembership :one
UPDATE memberships
SET role = 'core', status = 'active', left_at = NULL,
    baseline_picks = sqlc.arg(baseline_picks), rotation_position = sqlc.arg(rotation_position)
WHERE group_id = sqlc.arg(group_id) AND user_id = sqlc.arg(user_id)
RETURNING id, group_id, user_id, role, status, baseline_picks, rotation_position, joined_at, left_at;

-- name: AverageServedCount :one
SELECT COALESCE(AVG(m.baseline_picks + COALESCE(p.cnt, 0)), 0)::float8 AS avg_served
FROM memberships m
LEFT JOIN (
  SELECT picker_id, COUNT(*) FILTER (WHERE is_credited) AS cnt
  FROM picks
  WHERE group_id = sqlc.arg(group_id)
  GROUP BY picker_id
) p ON p.picker_id = m.user_id
WHERE m.group_id = sqlc.arg(group_id) AND m.status = 'active' AND m.role = 'core';

-- name: MemberCreditedCount :one
SELECT COALESCE(COUNT(*) FILTER (WHERE is_credited), 0)::int AS credited_count
FROM picks
WHERE group_id = sqlc.arg(group_id) AND picker_id = sqlc.arg(user_id);

-- name: MaxRotationPosition :one
SELECT COALESCE(MAX(rotation_position), 0)::int AS max_position
FROM memberships
WHERE group_id = sqlc.arg(group_id);
```

- [ ] **Step 2: Regenerate**

Run: `cd backend && just sqlc`
Expected: no errors; `internal/db/members.sql.go` created. The generated signatures will be:
`CreateUser(ctx, name string) (User, error)`, `InsertMembership(ctx, InsertMembershipParams) (Membership, error)`, `GetGroupMember(ctx, GetGroupMemberParams) (GetGroupMemberRow, error)`, `DeactivateMembership(ctx, DeactivateMembershipParams) (Membership, error)`, `ReactivateMembership(ctx, ReactivateMembershipParams) (Membership, error)`, `PromoteMembership(ctx, PromoteMembershipParams) (Membership, error)`, `AverageServedCount(ctx, groupID uuid.UUID) (float64, error)`, `MemberCreditedCount(ctx, MemberCreditedCountParams) (int32, error)`, `MaxRotationPosition(ctx, groupID uuid.UUID) (int32, error)`.

- [ ] **Step 3: Build**

Run: `cd backend && go build ./...`
Expected: success, no output.

- [ ] **Step 4: Commit**

```bash
cd backend && git add internal/db/query/members.sql internal/db/members.sql.go
git commit -m "feat(backend): add membership churn sqlc queries"
```

---

### Task 2: Extend `GET /members` to return everyone with status

**Goal:** The manage screen needs all members (active+inactive, core+guest) with their `status`. Change `ListGroupMembers` to return all, ordered active-core → active-guest → inactive, add `status` to the DTO, and update the integration fixture/assertions (incl. a seeded guest used later by the promote test).

**Files:**
- Modify: `backend/internal/db/query/roster.sql`
- Generated: `backend/internal/db/roster.sql.go`
- Modify: `backend/roster.go`
- Modify: `backend/roster_integration_test.go`

**Acceptance Criteria:**
- [ ] `ListGroupMembers` returns all memberships in the group with `role` and `status`, ordered active-core (by rotation_position) → active-guest → inactive
- [ ] `memberResponse` gains a `status` JSON field, populated by `toMemberResponses`
- [ ] The roster integration test asserts the new full, ordered list including the guest and inactive member
- [ ] `just check` passes; `go test -tags=integration -run '^TestMembersHandlerIntegration$' ./...` passes

**Verify:** `cd backend && just check && go test -tags=integration -run '^TestMembersHandlerIntegration$' ./...` → all green.

**Steps:**

- [ ] **Step 1: Update the query**

Replace the `ListGroupMembers` query in `backend/internal/db/query/roster.sql` with:

```sql
-- name: ListGroupMembers :many
SELECT u.id, u.name, m.role, m.status
FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE m.group_id = $1
ORDER BY
  CASE
    WHEN m.status = 'active' AND m.role = 'core'  THEN 0
    WHEN m.status = 'active' AND m.role = 'guest' THEN 1
    ELSE 2
  END,
  m.rotation_position,
  u.name;
```

- [ ] **Step 2: Regenerate + verify the row type**

Run: `cd backend && just sqlc && go build ./...`
Expected: `ListGroupMembersRow` now has fields `ID uuid.UUID`, `Name string`, `Role db.MembershipRole`, `Status db.MembershipStatus`. Build fails until Step 3 updates `roster.go` (that's expected).

- [ ] **Step 3: Add `status` to the DTO**

In `backend/roster.go`, update `memberResponse` and `toMemberResponses`:

```go
// memberResponse is the JSON shape returned by GET /groups/{groupId}/members and
// by the membership-churn write endpoints.
type memberResponse struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Role   string `json:"role"`
	Status string `json:"status"`
}

// toMemberResponses maps sqlc rows to JSON responses, preserving order. It always
// returns a non-nil slice so an empty result encodes as [] rather than null.
func toMemberResponses(rows []db.ListGroupMembersRow) []memberResponse {
	out := make([]memberResponse, 0, len(rows))
	for _, r := range rows {
		out = append(out, memberResponse{
			ID:     r.ID.String(),
			Name:   r.Name,
			Role:   string(r.Role),
			Status: string(r.Status),
		})
	}
	return out
}
```

- [ ] **Step 4: Update the integration fixture + assertions**

In `backend/roster_integration_test.go`, add a guest user + membership to `seedFixtures` (used here and by the churn test). In the users insert, add Gwen:

```go
		{
			sql: `INSERT INTO users (id, name) VALUES
				('a0000000-0000-0000-0000-000000000001', 'Ada'),
				('a0000000-0000-0000-0000-000000000002', 'Blake'),
				('a0000000-0000-0000-0000-000000000003', 'Cleo'),
				('a0000000-0000-0000-0000-000000000006', 'Gwen'),
				('a0000000-0000-0000-0000-000000000009', 'Zed')`,
		},
```

And in the memberships insert, add Gwen as an active guest (rotation_position 5):

```go
		{
			// rotation_position deliberately out of insert order to prove ORDER BY.
			// Zed is inactive; Gwen is an active guest (not in the rotation).
			sql: `INSERT INTO memberships (group_id, user_id, role, status, rotation_position) VALUES
				($1, 'a0000000-0000-0000-0000-000000000002', 'core', 'active', 2),
				($1, 'a0000000-0000-0000-0000-000000000001', 'core', 'active', 1),
				($1, 'a0000000-0000-0000-0000-000000000003', 'core', 'active', 3),
				($1, 'a0000000-0000-0000-0000-000000000009', 'core', 'inactive', 4),
				($1, 'a0000000-0000-0000-0000-000000000006', 'guest', 'active', 5)`,
			args: []any{seededGroup},
		},
```

Replace the `"active members in rotation order, inactive excluded"` subtest with one asserting the full ordered list with statuses/roles:

```go
	t.Run("all members ordered core, guest, then inactive", func(t *testing.T) {
		code, got := get(t, seededGroup)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		want := []memberResponse{
			{Name: "Ada", Role: "core", Status: "active"},
			{Name: "Blake", Role: "core", Status: "active"},
			{Name: "Cleo", Role: "core", Status: "active"},
			{Name: "Gwen", Role: "guest", Status: "active"},
			{Name: "Zed", Role: "core", Status: "inactive"},
		}
		if len(got) != len(want) {
			t.Fatalf("got %d members, want %d (%+v)", len(got), len(want), got)
		}
		for i, w := range want {
			if got[i].Name != w.Name || got[i].Role != w.Role || got[i].Status != w.Status {
				t.Errorf("[%d] = {%s %s %s}, want {%s %s %s}", i,
					got[i].Name, got[i].Role, got[i].Status, w.Name, w.Role, w.Status)
			}
		}
	})
```

(Leave the `"valid but unknown group returns empty array"` and `"malformed group id returns 400"` subtests unchanged.)

- [ ] **Step 5: Run the gates**

Run: `cd backend && just check && go test -tags=integration -run '^TestMembersHandlerIntegration$' ./...`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd backend && git add internal/db/query/roster.sql internal/db/roster.sql.go roster.go roster_integration_test.go
git commit -m "feat(backend): GET /members returns all members with status"
```

---

### Task 3: Pure seed helper + join-name validation (unit-tested)

**Goal:** Add the pure, unit-tested `seedBaseline` and `validateJoinName` helpers (plus the `joinRequest` DTO) in a new `membership.go`. No DB, no clock.

**Files:**
- Create: `backend/membership.go`
- Create: `backend/membership_test.go`

**Acceptance Criteria:**
- [ ] `seedBaseline(avg, existingCredited)` returns `max(0, round(avg) − existingCredited)`
- [ ] `validateJoinName` trims and rejects an empty/whitespace name
- [ ] Unit tests pass

**Verify:** `cd backend && go test -run '^TestSeedBaseline$|^TestValidateJoinName$' ./...` → `ok` / PASS.

**Steps:**

- [ ] **Step 1: Write the failing tests**

`backend/membership_test.go`:

```go
package main

import "testing"

func TestSeedBaseline(t *testing.T) {
	cases := []struct {
		name            string
		avg             float64
		existingCredit  int32
		want            int32
	}{
		{name: "fresh joiner seeds to rounded average", avg: 3.0, existingCredit: 0, want: 3},
		{name: "rounds to nearest", avg: 1.4, existingCredit: 0, want: 1},
		{name: "rounds half away from zero", avg: 2.5, existingCredit: 0, want: 3},
		{name: "subtracts existing credited picks", avg: 5.0, existingCredit: 2, want: 3},
		{name: "returner with history lands at average total", avg: 4.0, existingCredit: 4, want: 0},
		{name: "never negative", avg: 2.0, existingCredit: 5, want: 0},
		{name: "empty group averages to zero", avg: 0.0, existingCredit: 0, want: 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := seedBaseline(tc.avg, tc.existingCredit); got != tc.want {
				t.Errorf("seedBaseline(%v, %d) = %d, want %d", tc.avg, tc.existingCredit, got, tc.want)
			}
		})
	}
}

func TestValidateJoinName(t *testing.T) {
	t.Run("trims and accepts a real name", func(t *testing.T) {
		got, err := validateJoinName(joinRequest{Name: "  Ada  "})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != "Ada" {
			t.Errorf("name = %q, want %q", got, "Ada")
		}
	})
	for _, tc := range []struct{ name, in string }{
		{name: "empty", in: ""},
		{name: "whitespace only", in: "   "},
	} {
		t.Run("rejects "+tc.name, func(t *testing.T) {
			if _, err := validateJoinName(joinRequest{Name: tc.in}); err == nil {
				t.Fatal("expected error, got nil")
			}
		})
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test -run '^TestSeedBaseline$|^TestValidateJoinName$' ./...`
Expected: FAIL — `undefined: seedBaseline`, `undefined: validateJoinName`, `undefined: joinRequest` (does not compile).

- [ ] **Step 3: Write the implementation**

`backend/membership.go`:

```go
package main

import (
	"fmt"
	"math"
	"strings"
)

// joinRequest is the JSON body of POST /groups/{groupId}/members.
type joinRequest struct {
	Name string `json:"name"`
}

// validateJoinName trims and requires a non-empty member name. Pure.
func validateJoinName(req joinRequest) (string, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return "", fmt.Errorf("name is required")
	}
	return name, nil
}

// seedBaseline computes the baseline_picks to stamp on a membership entering the
// rotation so its TOTAL served-count (baseline + existing credited picks) lands
// at the current active-core average. Pure; never negative. For a brand-new
// joiner (existingCredited == 0) this is exactly round(avg).
func seedBaseline(avgServed float64, existingCredited int32) int32 {
	seed := int32(math.Round(avgServed)) - existingCredited
	if seed < 0 {
		return 0
	}
	return seed
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test -run '^TestSeedBaseline$|^TestValidateJoinName$' ./...`
Expected: PASS / `ok`.

- [ ] **Step 5: Commit**

```bash
cd backend && git add membership.go membership_test.go
git commit -m "feat(backend): pure baseline-seed and join-name validation"
```

---

### Task 4: Join handler (`POST /groups/{groupId}/members`)

**Goal:** Add the `memberStore` interface, shared handler helpers, and `joinMemberHandler` (create user + active-core membership, seeded), and register the route.

**Files:**
- Modify: `backend/membership.go`
- Modify: `backend/main.go`

**Acceptance Criteria:**
- [ ] `joinMemberHandler` validates the group UUID (400) and body (400), seeds `baseline = round(avg)`, inserts an active-core membership at `rotation_position = max+1`, and returns 201 + the created member (`{id, name, role, status}`)
- [ ] Route `POST /groups/{groupId}/members` is registered
- [ ] `just check` passes

**Verify:** `cd backend && just check` → all green.

**Steps:**

- [ ] **Step 1: Add imports, the store interface, helpers, and the handler**

Replace the import block at the top of `backend/membership.go` with:

```go
import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)
```

Append to the end of `backend/membership.go`:

```go
// memberStore is the subset of *db.Queries the churn handlers need; the real
// *db.Queries satisfies it, so no mock is ever written (same pattern as
// pickStore/turnStore).
type memberStore interface {
	CreateUser(ctx context.Context, name string) (db.User, error)
	InsertMembership(ctx context.Context, arg db.InsertMembershipParams) (db.Membership, error)
	GetGroupMember(ctx context.Context, arg db.GetGroupMemberParams) (db.GetGroupMemberRow, error)
	DeactivateMembership(ctx context.Context, arg db.DeactivateMembershipParams) (db.Membership, error)
	ReactivateMembership(ctx context.Context, arg db.ReactivateMembershipParams) (db.Membership, error)
	PromoteMembership(ctx context.Context, arg db.PromoteMembershipParams) (db.Membership, error)
	AverageServedCount(ctx context.Context, groupID uuid.UUID) (float64, error)
	MemberCreditedCount(ctx context.Context, arg db.MemberCreditedCountParams) (int32, error)
	MaxRotationPosition(ctx context.Context, groupID uuid.UUID) (int32, error)
}

// internalError logs a failed store call and writes a 500. gid is a parsed
// uuid.UUID (canonical hex), not free-form input.
func internalError(w http.ResponseWriter, gid uuid.UUID, what string, err error) {
	log.Printf("%s (%s): %v", what, gid, err) //#nosec G706 -- gid is a parsed uuid.UUID
	writeJSONError(w, http.StatusInternalServerError, "internal server error")
}

// encodeMember writes a member DTO as JSON with the given status code.
func encodeMember(w http.ResponseWriter, gid, userID uuid.UUID, name, role, status string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(memberResponse{
		ID:     userID.String(),
		Name:   name,
		Role:   role,
		Status: status,
	}); err != nil {
		log.Printf("encode member response (%s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID
	}
}

// joinMemberHandler serves POST /groups/{groupId}/members: a new person joins
// the rotation as an active core member, seeded to the current average.
func joinMemberHandler(store memberStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, err := parseGroupID(r.PathValue("groupId"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid group id")
			return
		}
		var req joinRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		name, err := validateJoinName(req)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}

		ctx := r.Context()
		avg, err := store.AverageServedCount(ctx, gid)
		if err != nil {
			internalError(w, gid, "average served", err)
			return
		}
		maxPos, err := store.MaxRotationPosition(ctx, gid)
		if err != nil {
			internalError(w, gid, "max rotation position", err)
			return
		}
		user, err := store.CreateUser(ctx, name)
		if err != nil {
			internalError(w, gid, "create user", err)
			return
		}
		membership, err := store.InsertMembership(ctx, db.InsertMembershipParams{
			GroupID:          gid,
			UserID:           user.ID,
			Role:             db.MembershipRoleCore,
			Status:           db.MembershipStatusActive,
			BaselinePicks:    seedBaseline(avg, 0),
			RotationPosition: maxPos + 1,
		})
		if err != nil {
			internalError(w, gid, "insert membership", err)
			return
		}

		encodeMember(w, gid, user.ID, user.Name, string(membership.Role), string(membership.Status), http.StatusCreated)
	}
}
```

- [ ] **Step 2: Register the route**

In `backend/main.go`, immediately after the existing line
`mux.Handle("POST /groups/{groupId}/picks", createPickHandler(queries))`, add:

```go
	mux.Handle("POST /groups/{groupId}/members", joinMemberHandler(queries))
```

- [ ] **Step 3: Run the gate**

Run: `cd backend && just check`
Expected: gofmt clean, `go vet` clean, build succeeds, all unit tests PASS.

- [ ] **Step 4: Commit**

```bash
cd backend && git add membership.go main.go
git commit -m "feat(backend): POST /groups/{groupId}/members join handler"
```

---

### Task 5: Transition handlers (deactivate / reactivate / promote)

**Goal:** Add the three idempotent transition handlers (each: parse path, load member → 404, no-op if already in target state, seed iff crossing into the rotation, update, return the member) and register their routes.

**Files:**
- Modify: `backend/membership.go`
- Modify: `backend/main.go`

**Acceptance Criteria:**
- [ ] All three parse `groupId`+`userId` (400 on malformed), 404 when the membership is absent
- [ ] `deactivate` sets inactive (+`left_at`), no-op if already inactive
- [ ] `reactivate` sets active, re-seeds **only** if the member is core (entering the rotation), no-op if already active
- [ ] `promote` sets role=core+active, re-seeds, `rotation_position = max+1`, no-op if already active-core
- [ ] All return 200 + the member; `just check` passes

**Verify:** `cd backend && just check` → all green. (Behavior is proven end-to-end in Task 6.)

**Steps:**

- [ ] **Step 1: Append the path helper, member loader, and three handlers**

Append to the end of `backend/membership.go`:

```go
// parseGroupAndUser validates the {groupId} and {userId} path segments as UUIDs,
// writing a 400 and returning ok=false on either malformed value.
func parseGroupAndUser(w http.ResponseWriter, r *http.Request) (gid, uid uuid.UUID, ok bool) {
	gid, err := parseGroupID(r.PathValue("groupId"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid group id")
		return uuid.UUID{}, uuid.UUID{}, false
	}
	uid, err = uuid.Parse(r.PathValue("userId"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid user id")
		return uuid.UUID{}, uuid.UUID{}, false
	}
	return gid, uid, true
}

// loadMember fetches a member for a transition handler, mapping a missing
// membership to 404 and any other error to 500. ok=false means a response has
// already been written and the caller should stop.
func loadMember(w http.ResponseWriter, r *http.Request, store memberStore, gid, uid uuid.UUID) (db.GetGroupMemberRow, bool) {
	m, err := store.GetGroupMember(r.Context(), db.GetGroupMemberParams{GroupID: gid, UserID: uid})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "member not found")
			return db.GetGroupMemberRow{}, false
		}
		internalError(w, gid, "get group member", err)
		return db.GetGroupMemberRow{}, false
	}
	return m, true
}

// deactivateMemberHandler serves POST /groups/{groupId}/members/{userId}/deactivate.
func deactivateMemberHandler(store memberStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, uid, ok := parseGroupAndUser(w, r)
		if !ok {
			return
		}
		m, ok := loadMember(w, r, store, gid, uid)
		if !ok {
			return
		}
		// Idempotent: already inactive → no-op.
		if m.Status == db.MembershipStatusInactive {
			encodeMember(w, gid, m.UserID, m.Name, string(m.Role), string(m.Status), http.StatusOK)
			return
		}
		updated, err := store.DeactivateMembership(r.Context(), db.DeactivateMembershipParams{GroupID: gid, UserID: uid})
		if err != nil {
			internalError(w, gid, "deactivate membership", err)
			return
		}
		encodeMember(w, gid, updated.UserID, m.Name, string(updated.Role), string(updated.Status), http.StatusOK)
	}
}

// reactivateMemberHandler serves POST /groups/{groupId}/members/{userId}/reactivate.
func reactivateMemberHandler(store memberStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, uid, ok := parseGroupAndUser(w, r)
		if !ok {
			return
		}
		ctx := r.Context()
		m, ok := loadMember(w, r, store, gid, uid)
		if !ok {
			return
		}
		// Idempotent: already active → no-op.
		if m.Status == db.MembershipStatusActive {
			encodeMember(w, gid, m.UserID, m.Name, string(m.Role), string(m.Status), http.StatusOK)
			return
		}
		// Seed only when this crosses into the rotation (active core). A
		// reactivated guest stays out of the rotation, so its baseline is kept.
		baseline := m.BaselinePicks
		if m.Role == db.MembershipRoleCore {
			avg, err := store.AverageServedCount(ctx, gid)
			if err != nil {
				internalError(w, gid, "average served", err)
				return
			}
			credited, err := store.MemberCreditedCount(ctx, db.MemberCreditedCountParams{GroupID: gid, UserID: uid})
			if err != nil {
				internalError(w, gid, "member credited count", err)
				return
			}
			baseline = seedBaseline(avg, credited)
		}
		updated, err := store.ReactivateMembership(ctx, db.ReactivateMembershipParams{GroupID: gid, UserID: uid, BaselinePicks: baseline})
		if err != nil {
			internalError(w, gid, "reactivate membership", err)
			return
		}
		encodeMember(w, gid, updated.UserID, m.Name, string(updated.Role), string(updated.Status), http.StatusOK)
	}
}

// promoteMemberHandler serves POST /groups/{groupId}/members/{userId}/promote.
func promoteMemberHandler(store memberStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, uid, ok := parseGroupAndUser(w, r)
		if !ok {
			return
		}
		ctx := r.Context()
		m, ok := loadMember(w, r, store, gid, uid)
		if !ok {
			return
		}
		// Idempotent: already active core → no-op.
		if m.Role == db.MembershipRoleCore && m.Status == db.MembershipStatusActive {
			encodeMember(w, gid, m.UserID, m.Name, string(m.Role), string(m.Status), http.StatusOK)
			return
		}
		avg, err := store.AverageServedCount(ctx, gid)
		if err != nil {
			internalError(w, gid, "average served", err)
			return
		}
		credited, err := store.MemberCreditedCount(ctx, db.MemberCreditedCountParams{GroupID: gid, UserID: uid})
		if err != nil {
			internalError(w, gid, "member credited count", err)
			return
		}
		maxPos, err := store.MaxRotationPosition(ctx, gid)
		if err != nil {
			internalError(w, gid, "max rotation position", err)
			return
		}
		updated, err := store.PromoteMembership(ctx, db.PromoteMembershipParams{
			GroupID:          gid,
			UserID:           uid,
			BaselinePicks:    seedBaseline(avg, credited),
			RotationPosition: maxPos + 1,
		})
		if err != nil {
			internalError(w, gid, "promote membership", err)
			return
		}
		encodeMember(w, gid, updated.UserID, m.Name, string(updated.Role), string(updated.Status), http.StatusOK)
	}
}
```

- [ ] **Step 2: Register the routes**

In `backend/main.go`, immediately after the join route added in Task 4, add:

```go
	mux.Handle("POST /groups/{groupId}/members/{userId}/deactivate", deactivateMemberHandler(queries))
	mux.Handle("POST /groups/{groupId}/members/{userId}/reactivate", reactivateMemberHandler(queries))
	mux.Handle("POST /groups/{groupId}/members/{userId}/promote", promoteMemberHandler(queries))
```

- [ ] **Step 3: Run the gate**

Run: `cd backend && just check`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
cd backend && git add membership.go main.go
git commit -m "feat(backend): deactivate/reactivate/promote membership handlers"
```

---

### Task 6: Backend integration test (testcontainers)

**Goal:** Prove against real Postgres that join/leave/return/promote each move the standings correctly, that entrants land at the average (incl. a returner with pick history, which exercises the `− existingCredited` branch), and that the ops are idempotent and return 404/400 on bad targets/input.

**Files:**
- Create: `backend/membership_integration_test.go`

**Acceptance Criteria:**
- [ ] join → 201; the new member appears in `/turn` with `servedCount == round(avg)`
- [ ] deactivate removes a member from `/turn`; a second deactivate is a no-op (still inactive)
- [ ] reactivate returns a member with **prior credited picks** to `/turn` at exactly `round(avg)` (not double-counted); a second reactivate leaves the count unchanged
- [ ] promote brings the seeded guest into `/turn` at `round(avg)`; a second promote leaves the count unchanged
- [ ] unknown `userId` → 404; malformed `userId` → 400; empty join name → 400
- [ ] `just test-integration` passes (needs the Podman runtime)

**Verify:** `cd backend && go test -tags=integration -run '^TestMembershipChurnIntegration$' ./...` → PASS.

**Steps:**

- [ ] **Step 1: Write the integration test**

`backend/membership_integration_test.go` (reuses `startPostgres`, `seedFixtures`, `seededGroup` from `roster_integration_test.go`; the guest **Gwen** `a0…006` is seeded there):

```go
//go:build integration

package main

import (
	"bytes"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestMembershipChurnIntegration(t *testing.T) {
	pool := startPostgres(t)
	seedFixtures(t, pool)
	q := db.New(pool)

	mux := http.NewServeMux()
	mux.Handle("POST /groups/{groupId}/members", joinMemberHandler(q))
	mux.Handle("POST /groups/{groupId}/members/{userId}/deactivate", deactivateMemberHandler(q))
	mux.Handle("POST /groups/{groupId}/members/{userId}/reactivate", reactivateMemberHandler(q))
	mux.Handle("POST /groups/{groupId}/members/{userId}/promote", promoteMemberHandler(q))
	mux.Handle("POST /groups/{groupId}/picks", createPickHandler(q))
	mux.Handle("GET /groups/{groupId}/turn", turnHandler(q))

	const (
		ada  = "a0000000-0000-0000-0000-000000000001"
		cleo = "a0000000-0000-0000-0000-000000000003"
		gwen = "a0000000-0000-0000-0000-000000000006"
	)

	do := func(t *testing.T, method, path, body string) (int, memberResponse) {
		t.Helper()
		rec := httptest.NewRecorder()
		var r *http.Request
		if body == "" {
			r = httptest.NewRequest(method, path, nil)
		} else {
			r = httptest.NewRequest(method, path, bytes.NewBufferString(body))
		}
		mux.ServeHTTP(rec, r)
		var m memberResponse
		if rec.Code == http.StatusOK || rec.Code == http.StatusCreated {
			_ = json.Unmarshal(rec.Body.Bytes(), &m)
		}
		return rec.Code, m
	}

	getTurn := func(t *testing.T) []turnResponse {
		t.Helper()
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/groups/"+seededGroup+"/turn", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("turn status = %d, want 200", rec.Code)
		}
		var got []turnResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatalf("decode turn: %v", err)
		}
		return got
	}

	// roundedTurnAvg returns round(mean(servedCount)) over the current active
	// core — the same set and value the backend seeds against.
	roundedTurnAvg := func(t *testing.T) int32 {
		t.Helper()
		rows := getTurn(t)
		if len(rows) == 0 {
			return 0
		}
		var sum int32
		for _, r := range rows {
			sum += r.ServedCount
		}
		return int32(math.Round(float64(sum) / float64(len(rows))))
	}

	servedOf := func(t *testing.T, name string) (int32, bool) {
		t.Helper()
		for _, r := range getTurn(t) {
			if r.Name == name {
				return r.ServedCount, true
			}
		}
		return 0, false
	}

	recordPick := func(t *testing.T, picker, date string) {
		t.Helper()
		rec := httptest.NewRecorder()
		body := `{"pickerId":"` + picker + `","scheduledFor":"` + date + `"}`
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/groups/"+seededGroup+"/picks", bytes.NewBufferString(body)))
		if rec.Code != http.StatusCreated {
			t.Fatalf("record pick for %s: status = %d, want 201", picker, rec.Code)
		}
	}

	// Build pick history so the average is non-trivial and Cleo carries history:
	// Ada 2 credited, Blake 1, Cleo 1.
	recordPick(t, ada, "2026-05-01")
	recordPick(t, ada, "2026-05-08")
	recordPick(t, "a0000000-0000-0000-0000-000000000002", "2026-05-15") // Blake
	recordPick(t, cleo, "2026-05-22")

	t.Run("join lands the new member at the average", func(t *testing.T) {
		want := roundedTurnAvg(t)
		code, m := do(t, http.MethodPost, "/groups/"+seededGroup+"/members", `{"name":"Newbie"}`)
		if code != http.StatusCreated {
			t.Fatalf("status = %d, want 201", code)
		}
		if m.Name != "Newbie" || m.Role != "core" || m.Status != "active" || m.ID == "" {
			t.Fatalf("response = %+v", m)
		}
		got, ok := servedOf(t, "Newbie")
		if !ok {
			t.Fatal("Newbie not in /turn after join")
		}
		if got != want {
			t.Errorf("Newbie servedCount = %d, want %d (the average)", got, want)
		}
	})

	t.Run("leave removes the member; second deactivate is a no-op", func(t *testing.T) {
		code, m := do(t, http.MethodPost, "/groups/"+seededGroup+"/members/"+cleo+"/deactivate", "")
		if code != http.StatusOK || m.Status != "inactive" {
			t.Fatalf("status=%d member=%+v, want 200/inactive", code, m)
		}
		if _, ok := servedOf(t, "Cleo"); ok {
			t.Error("Cleo still in /turn after deactivate")
		}
		code, m = do(t, http.MethodPost, "/groups/"+seededGroup+"/members/"+cleo+"/deactivate", "")
		if code != http.StatusOK || m.Status != "inactive" {
			t.Errorf("idempotent deactivate: status=%d member=%+v, want 200/inactive", code, m)
		}
	})

	t.Run("return re-seeds a member with history to the average, idempotently", func(t *testing.T) {
		want := roundedTurnAvg(t) // average BEFORE Cleo re-enters (she's excluded)
		code, m := do(t, http.MethodPost, "/groups/"+seededGroup+"/members/"+cleo+"/reactivate", "")
		if code != http.StatusOK || m.Status != "active" {
			t.Fatalf("status=%d member=%+v, want 200/active", code, m)
		}
		got, ok := servedOf(t, "Cleo")
		if !ok {
			t.Fatal("Cleo not back in /turn after reactivate")
		}
		// Cleo has 1 prior credited pick; total must still equal the average,
		// proving baseline = round(avg) − 1 (not the literal round(avg)).
		if got != want {
			t.Errorf("Cleo servedCount = %d, want %d (the average, history not double-counted)", got, want)
		}
		// Second reactivate must not re-seed.
		do(t, http.MethodPost, "/groups/"+seededGroup+"/members/"+cleo+"/reactivate", "")
		if again, _ := servedOf(t, "Cleo"); again != got {
			t.Errorf("idempotent reactivate changed servedCount: %d → %d", got, again)
		}
	})

	t.Run("promote brings the guest into the rotation at the average, idempotently", func(t *testing.T) {
		want := roundedTurnAvg(t) // average BEFORE Gwen enters (guest, excluded)
		code, m := do(t, http.MethodPost, "/groups/"+seededGroup+"/members/"+gwen+"/promote", "")
		if code != http.StatusOK || m.Role != "core" || m.Status != "active" {
			t.Fatalf("status=%d member=%+v, want 200/core/active", code, m)
		}
		got, ok := servedOf(t, "Gwen")
		if !ok {
			t.Fatal("Gwen not in /turn after promote")
		}
		if got != want {
			t.Errorf("Gwen servedCount = %d, want %d (the average)", got, want)
		}
		do(t, http.MethodPost, "/groups/"+seededGroup+"/members/"+gwen+"/promote", "")
		if again, _ := servedOf(t, "Gwen"); again != got {
			t.Errorf("idempotent promote changed servedCount: %d → %d", got, again)
		}
	})

	t.Run("bad targets and input", func(t *testing.T) {
		// Unknown but well-formed userId → 404.
		code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/members/a0000000-0000-0000-0000-0000000000ff/deactivate", "")
		if code != http.StatusNotFound {
			t.Errorf("unknown user deactivate: status = %d, want 404", code)
		}
		// Malformed userId → 400.
		code, _ = do(t, http.MethodPost, "/groups/"+seededGroup+"/members/not-a-uuid/promote", "")
		if code != http.StatusBadRequest {
			t.Errorf("malformed user promote: status = %d, want 400", code)
		}
		// Empty join name → 400.
		code, _ = do(t, http.MethodPost, "/groups/"+seededGroup+"/members", `{"name":"   "}`)
		if code != http.StatusBadRequest {
			t.Errorf("empty join name: status = %d, want 400", code)
		}
	})
}
```

- [ ] **Step 2: Run the integration test**

Run: `cd backend && go test -tags=integration -run '^TestMembershipChurnIntegration$' ./...`
Expected: PASS (boots `postgres:18` via testcontainers / Podman).

- [ ] **Step 3: Commit**

```bash
cd backend && git add membership_integration_test.go
git commit -m "test(backend): integration test for membership churn"
```

---

### Task 7: Dev seed gains a guest

**Goal:** Add a guest user to `seed.sql` so the manage screen can demonstrate promotion against the running dev backend.

**Files:**
- Modify: `backend/seed.sql`

**Acceptance Criteria:**
- [ ] `seed.sql` inserts one active guest member in the shared group
- [ ] Re-seeding stays idempotent (fixed UUIDs + `ON CONFLICT DO NOTHING`)

**Verify:** `cd backend && just db-up && just migrate && just seed` → no errors; then
`curl -s localhost:8080/groups/11111111-1111-1111-1111-111111111111/members` (after `just run`) lists a `"role":"guest"` member. (If the DB is already up, `just seed` alone suffices.)

**Steps:**

- [ ] **Step 1: Add the guest user**

In `backend/seed.sql`, extend the `users` insert with Frankie:

```sql
INSERT INTO users (id, name) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Ada'),
    ('a0000000-0000-0000-0000-000000000002', 'Blake'),
    ('a0000000-0000-0000-0000-000000000003', 'Cleo'),
    ('a0000000-0000-0000-0000-000000000004', 'Dev'),
    ('a0000000-0000-0000-0000-000000000005', 'Esme'),
    ('a0000000-0000-0000-0000-000000000006', 'Frankie')
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Add the guest membership**

Extend the `memberships` insert with Frankie as an active guest (rotation_position 6):

```sql
INSERT INTO memberships (id, group_id, user_id, role, status, baseline_picks, rotation_position) VALUES
    ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'core', 'active', 0, 1),
    ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', 'core', 'active', 0, 2),
    ('b0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003', 'core', 'active', 0, 3),
    ('b0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004', 'core', 'active', 0, 4),
    ('b0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000005', 'core', 'active', 0, 5),
    ('b0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000006', 'guest', 'active', 0, 6)
ON CONFLICT (group_id, user_id) DO NOTHING;
```

- [ ] **Step 3: Commit**

```bash
cd backend && git add seed.sql
git commit -m "chore(backend): seed a guest member for the promote demo"
```

---

### Task 8: Mobile picks client → members write ops (`lib/members.ts`)

**Goal:** Add `status` to `Member`, plus `addMember`/`deactivateMember`/`reactivateMember`/`promoteMember`, with unit + real-server integration tests, mirroring `lib/picks.ts`.

**Files:**
- Modify: `mobile/lib/members.ts`
- Modify: `mobile/lib/members.test.ts`
- Create: `mobile/lib/members.integration.test.ts`

**Acceptance Criteria:**
- [ ] `Member` has `status: "active" | "inactive"`; `parseMember` validates it
- [ ] each write op POSTs to the right path (the join op sends `{name}`; the transitions send no body), throws on non-2xx, and returns the parsed `Member`
- [ ] unit + integration tests pass

**Verify:** `cd mobile && node --import tsx --test lib/members.test.ts lib/members.integration.test.ts` → all pass; then `just check`.

**Steps:**

- [ ] **Step 1: Update the unit tests (status + write-op parsing)**

Replace `mobile/lib/members.test.ts` with:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseMembers, type Member } from "./members";

// parseMembers validates an untrusted JSON payload from the backend and
// returns typed Members, or throws a descriptive error. Pure, table-driven.

test("parses a valid array of members", () => {
  const raw = [
    { id: "a", name: "Ada", role: "core", status: "active" },
    { id: "b", name: "Bo", role: "guest", status: "inactive" },
  ];
  const want: Member[] = [
    { id: "a", name: "Ada", role: "core", status: "active" },
    { id: "b", name: "Bo", role: "guest", status: "inactive" },
  ];
  assert.deepEqual(parseMembers(raw), want);
});

test("parses an empty array", () => {
  assert.deepEqual(parseMembers([]), []);
});

const invalid: { name: string; raw: unknown; wantError: RegExp }[] = [
  { name: "rejects a non-array payload", raw: { id: "a" }, wantError: /array/ },
  { name: "rejects a null payload", raw: null, wantError: /array/ },
  {
    name: "rejects a non-object element",
    raw: ["nope"],
    wantError: /member 0.*object/,
  },
  {
    name: "rejects a missing id",
    raw: [{ name: "Ada", role: "core", status: "active" }],
    wantError: /member 0.*id/,
  },
  {
    name: "rejects a non-string name",
    raw: [{ id: "a", name: 42, role: "core", status: "active" }],
    wantError: /member 0.*name/,
  },
  {
    name: "rejects an unknown role",
    raw: [{ id: "a", name: "Ada", role: "admin", status: "active" }],
    wantError: /member 0.*role/,
  },
  {
    name: "rejects an unknown status",
    raw: [{ id: "a", name: "Ada", role: "core", status: "left" }],
    wantError: /member 0.*status/,
  },
];

for (const c of invalid) {
  test(c.name, () => {
    assert.throws(() => parseMembers(c.raw), c.wantError);
  });
}
```

- [ ] **Step 2: Write the integration tests**

`mobile/lib/members.integration.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {
  addMember,
  deactivateMember,
  promoteMember,
  reactivateMember,
  type Member,
} from "./members";

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

async function startServer(
  handler: Handler,
): Promise<{ url: string; close: () => Promise<void> }> {
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
const USER = "a0000000-0000-0000-0000-000000000006";

async function capture(
  status: number,
  member: Member,
  call: (url: string) => Promise<Member>,
): Promise<{ method: string; path: string; body: string; result: Member }> {
  let method = "";
  let path = "";
  let body = "";
  const server = await startServer((req, res) => {
    method = req.method ?? "";
    path = req.url ?? "";
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      body = Buffer.concat(chunks).toString();
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(member));
    });
  });
  try {
    const result = await call(server.url);
    return { method, path, body, result };
  } finally {
    await server.close();
  }
}

test("addMember posts {name} to the members path and returns the member", async () => {
  const created: Member = { id: "u1", name: "Newbie", role: "core", status: "active" };
  const { method, path, body, result } = await capture(201, created, (url) =>
    addMember(url, GROUP, "Newbie"),
  );
  assert.equal(method, "POST");
  assert.equal(path, `/groups/${GROUP}/members`);
  assert.deepEqual(JSON.parse(body), { name: "Newbie" });
  assert.deepEqual(result, created);
});

test("deactivateMember posts to the deactivate path with no body", async () => {
  const m: Member = { id: USER, name: "Frankie", role: "guest", status: "inactive" };
  const { method, path, body, result } = await capture(200, m, (url) =>
    deactivateMember(url, GROUP, USER),
  );
  assert.equal(method, "POST");
  assert.equal(path, `/groups/${GROUP}/members/${USER}/deactivate`);
  assert.equal(body, "");
  assert.deepEqual(result, m);
});

test("reactivateMember posts to the reactivate path", async () => {
  const m: Member = { id: USER, name: "Frankie", role: "core", status: "active" };
  const { path } = await capture(200, m, (url) => reactivateMember(url, GROUP, USER));
  assert.equal(path, `/groups/${GROUP}/members/${USER}/reactivate`);
});

test("promoteMember posts to the promote path", async () => {
  const m: Member = { id: USER, name: "Frankie", role: "core", status: "active" };
  const { path } = await capture(200, m, (url) => promoteMember(url, GROUP, USER));
  assert.equal(path, `/groups/${GROUP}/members/${USER}/promote`);
});

test("a write op throws on a non-2xx response", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 404;
    res.end("nope");
  });
  try {
    await assert.rejects(
      deactivateMember(server.url, GROUP, USER),
      /request failed: 404/,
    );
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd mobile && node --import tsx --test lib/members.test.ts lib/members.integration.test.ts`
Expected: FAIL — `status` missing on `Member`; `addMember`/etc. not exported.

- [ ] **Step 4: Rewrite the implementation**

Replace `mobile/lib/members.ts` with:

```ts
export type Member = {
  id: string;
  name: string;
  role: "core" | "guest";
  status: "active" | "inactive";
};

function parseMember(raw: unknown, index = 0): Member {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`member ${index}: expected an object`);
  }
  const { id, name, role, status } = raw as Record<string, unknown>;
  if (typeof id !== "string") {
    throw new Error(`member ${index}: id must be a string`);
  }
  if (typeof name !== "string") {
    throw new Error(`member ${index}: name must be a string`);
  }
  if (role !== "core" && role !== "guest") {
    throw new Error(`member ${index}: role must be "core" or "guest"`);
  }
  if (status !== "active" && status !== "inactive") {
    throw new Error(`member ${index}: status must be "active" or "inactive"`);
  }
  return { id, name, role, status };
}

// parseMembers validates an untrusted JSON payload and returns typed Members,
// throwing a descriptive error if the shape is wrong. This keeps the lie out
// of `await res.json()` — the boundary is checked, not just asserted.
export function parseMembers(raw: unknown): Member[] {
  if (!Array.isArray(raw)) {
    throw new Error("expected an array of members");
  }
  return raw.map((m, i) => parseMember(m, i));
}

// fetchMembers loads a group's full roster (active + inactive, core + guest)
// from the backend. The signal lets the caller cancel an in-flight request.
export async function fetchMembers(
  baseUrl: string,
  groupId: string,
  signal?: AbortSignal,
): Promise<Member[]> {
  const res = await fetch(`${baseUrl}/groups/${groupId}/members`, { signal });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  return parseMembers(await res.json());
}

// postMember POSTs to a membership endpoint and returns the resulting member.
// An undefined body sends no payload (the transition endpoints take none).
async function postMember(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Member> {
  const res = await fetch(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  return parseMember(await res.json());
}

// addMember adds a new core member by name (join). Returns the created Member.
export function addMember(
  baseUrl: string,
  groupId: string,
  name: string,
  signal?: AbortSignal,
): Promise<Member> {
  return postMember(`${baseUrl}/groups/${groupId}/members`, { name }, signal);
}

// deactivateMember removes a member from the rotation (leave).
export function deactivateMember(
  baseUrl: string,
  groupId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<Member> {
  return postMember(`${baseUrl}/groups/${groupId}/members/${userId}/deactivate`, undefined, signal);
}

// reactivateMember returns a deactivated member to the rotation (return).
export function reactivateMember(
  baseUrl: string,
  groupId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<Member> {
  return postMember(`${baseUrl}/groups/${groupId}/members/${userId}/reactivate`, undefined, signal);
}

// promoteMember promotes a guest into the core rotation (promote).
export function promoteMember(
  baseUrl: string,
  groupId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<Member> {
  return postMember(`${baseUrl}/groups/${groupId}/members/${userId}/promote`, undefined, signal);
}
```

- [ ] **Step 5: Run tests to verify they pass + full gate**

Run: `cd mobile && node --import tsx --test lib/members.test.ts lib/members.integration.test.ts && just check`
Expected: all tests pass; lint + typecheck clean.

- [ ] **Step 6: Commit**

```bash
cd mobile && git add lib/members.ts lib/members.test.ts lib/members.integration.test.ts
git commit -m "feat(mobile): members client gains status + churn write ops"
```

---

### Task 9: Migrate navigation to expo-router

**Goal:** Replace the single-`App.tsx` entry with file-based routing so a second screen can exist. The turn screen moves to `app/index.tsx` unchanged in behavior; a Stack header hosts it; an empty `app/manage.tsx` placeholder is filled in Task 10.

**Files:**
- Modify: `mobile/package.json` (`main`, deps)
- Modify: `mobile/app.json`
- Modify: `mobile/tsconfig.json`
- Create: `mobile/babel.config.js`
- Create: `mobile/app/_layout.tsx`
- Create: `mobile/app/index.tsx`
- Create: `mobile/app/manage.tsx` (placeholder)
- Delete: `mobile/App.tsx`, `mobile/index.ts`

**Acceptance Criteria:**
- [ ] `main` is `expo-router/entry`; `expo-router` + `expo-linking` are installed
- [ ] `app/_layout.tsx` renders a `Stack` with titled `index` and `manage` screens
- [ ] `app/index.tsx` is the prior turn screen (same tap-to-record behavior) with a link to `/manage`
- [ ] `just check` passes (lint, typecheck, test)

**Verify:** `cd mobile && just check` → all green. Then `just start-clean` and confirm the turn screen loads with a "Manage members" link in its header area. (Reads the SDK-54 docs at <https://docs.expo.dev/versions/v54.0.0/> per `mobile/AGENTS.md`.)

**Steps:**

- [ ] **Step 1: Install expo-router**

Run: `cd mobile && npx expo install expo-router expo-linking`
Expected: `package.json` gains `expo-router` and `expo-linking` at SDK-54-compatible versions. (`react-native-screens`, `react-native-safe-area-context`, `expo-constants`, `expo-status-bar` are already present.)

- [ ] **Step 2: Point the entry at expo-router and delete the old entry**

In `mobile/package.json`, change the `main` field:

```json
  "main": "expo-router/entry",
```

Then delete the old entry file:

```bash
cd mobile && git rm index.ts
```

- [ ] **Step 3: Add the babel config**

Create `mobile/babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
```

- [ ] **Step 4: Configure app.json**

In `mobile/app.json`, add `scheme`, `web.bundler`, and `experiments.typedRoutes` inside the `expo` object (add `bundler` to the existing `web` block):

```json
    "scheme": "movienight",
    "web": {
      "favicon": "./assets/favicon.png",
      "bundler": "metro"
    },
    "experiments": {
      "typedRoutes": true
    }
```

- [ ] **Step 5: Let tsc see the generated route types**

Replace `mobile/tsconfig.json` with:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts"
  ]
}
```

- [ ] **Step 6: Create the layout**

Create `mobile/app/_layout.tsx`:

```tsx
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: "Whose turn?" }} />
        <Stack.Screen name="manage" options={{ title: "Manage members" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 7: Move the turn screen to `app/index.tsx`**

Create `mobile/app/index.tsx` (the prior `App.tsx`, adapted: imports now reach up one level via `../lib`; the Stack provides the header + safe area, so the local `SafeAreaProvider`/`SafeAreaView`/inline title are dropped in favor of a `View` and a `Link` to `/manage`):

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";
import { Link } from "expo-router";

import { resolveApiBaseUrl } from "../lib/api";
import { todayLocalISO } from "../lib/date";
import { recordPick } from "../lib/picks";
import { fetchTurn, type TurnMember } from "../lib/turn";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});
const GROUP_ID = "11111111-1111-1111-1111-111111111111";

export default function TurnScreen() {
  const [turn, setTurn] = useState<TurnMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  // Mirror of recordingId read synchronously by the in-flight guard, so onRecord
  // can stay out of recordingId's render cycle and keep a stable identity.
  const recordingRef = useRef<string | null>(null);

  const loadTurn = useCallback(async (signal?: AbortSignal) => {
    const data = await fetchTurn(API_URL, GROUP_ID, signal);
    setTurn(data);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        await loadTurn(controller.signal);
      } catch (e) {
        if (controller.signal.aborted) {
          return;
        }
        setError(e instanceof Error ? e.message : "failed to load turn order");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [loadTurn]);

  const onRecord = useCallback(
    async (member: TurnMember) => {
      if (recordingRef.current !== null) {
        return;
      }
      recordingRef.current = member.id;
      setRecordingId(member.id);
      setRecordError(null);
      try {
        // No abort signal here on purpose: a pick write should finish even if
        // the screen unmounts mid-request, and a stray state set after unmount
        // is benign under React 18.
        await recordPick(API_URL, GROUP_ID, {
          pickerId: member.id,
          scheduledFor: todayLocalISO(),
          isCredited: true,
        });
        await loadTurn();
      } catch (e) {
        setRecordError(e instanceof Error ? e.message : "failed to record pick");
      } finally {
        recordingRef.current = null;
        setRecordingId(null);
      }
    },
    [loadTurn],
  );

  return (
    <View style={styles.container}>
      <Link href="/manage" style={styles.manageLink}>
        Manage members →
      </Link>
      {loading ? (
        <ActivityIndicator style={styles.center} size="large" />
      ) : error ? (
        <Text style={[styles.center, styles.error]}>
          {`Couldn't load turn order: ${error}`}
        </Text>
      ) : turn.length === 0 ? (
        <Text style={styles.center}>No members yet.</Text>
      ) : (
        <>
          {recordError !== null && (
            <Text style={[styles.banner, styles.error]}>
              {`Couldn't record pick: ${recordError}`}
            </Text>
          )}
          <FlatList
            data={turn}
            keyExtractor={(m) => m.id}
            renderItem={({ item, index }) => {
              const isPicker = index === 0;
              const picks = `${item.servedCount} pick${item.servedCount === 1 ? "" : "s"}`;
              const last = item.lastPickedOn ?? "never";
              const isRecording = recordingId === item.id;
              return (
                <Pressable
                  onPress={() => onRecord(item)}
                  disabled={recordingId !== null}
                  style={({ pressed }) => [
                    styles.row,
                    isPicker && styles.pickerRow,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.rowMain}>
                    <Text style={styles.name}>{item.name}</Text>
                    {isPicker && (
                      <Text style={styles.badge}>{"Tonight's pick"}</Text>
                    )}
                  </View>
                  <Text style={styles.meta}>
                    {isRecording ? "Recording…" : `${picks} · last: ${last}`}
                  </Text>
                </Pressable>
              );
            }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  manageLink: {
    fontSize: 16,
    color: "#0b66c3",
    fontWeight: "600",
    paddingVertical: 12,
    textAlign: "right",
  },
  center: { marginTop: 32, textAlign: "center" },
  error: { color: "#b00020" },
  banner: { paddingVertical: 8, textAlign: "center" },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
  },
  rowPressed: { opacity: 0.6 },
  pickerRow: {
    backgroundColor: "#eef6ff",
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  rowMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: { fontSize: 18 },
  badge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0b66c3",
    textTransform: "uppercase",
  },
  meta: { fontSize: 14, color: "#666", marginTop: 4 },
});
```

- [ ] **Step 8: Add a placeholder manage screen + delete App.tsx**

Create `mobile/app/manage.tsx` (filled in Task 10):

```tsx
import { Text, View } from "react-native";

export default function ManageScreen() {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text>Manage members — coming in the next step.</Text>
    </View>
  );
}
```

Then remove the old root component:

```bash
cd mobile && git rm App.tsx
```

- [ ] **Step 9: Run the gate**

Run: `cd mobile && just check`
Expected: lint clean, typecheck clean (the `.expo/types` are generated on the first `expo start`/typed-routes run; if `tsc` complains about the `/manage` href before they exist, run `npx expo customize tsconfig.json` is NOT needed — instead run `just start-clean` once to generate `.expo/types`, stop it, then re-run `just typecheck`), tests pass.

- [ ] **Step 10: Commit**

```bash
cd mobile && git add -A
git commit -m "feat(mobile): migrate navigation to expo-router"
```

---

### Task 10: Manage-members screen (`app/manage.tsx`)

**Goal:** Replace the placeholder with the real screen: list every member with role/status badges, an add-member input (join), and per-row deactivate / reactivate / promote actions, each refetching the list.

**Files:**
- Modify: `mobile/app/manage.tsx`

**Acceptance Criteria:**
- [ ] On mount, loads the full member list via `fetchMembers`
- [ ] An "add member" text input + button calls `addMember`, clears the field, and refetches
- [ ] Each row shows role/status and the actions valid for its state (active core → Deactivate; active guest → Promote, Deactivate; inactive → Reactivate), each calling the matching client op then refetching
- [ ] A single action is in flight at a time (others disabled); failures surface in an error line
- [ ] `just check` passes

**Verify:** `cd mobile && just check` → all green. Then the manual smoke check in Final Verification.

**Steps:**

- [ ] **Step 1: Write the screen**

Replace `mobile/app/manage.tsx` with:

```tsx
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Button,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Constants from "expo-constants";

import { resolveApiBaseUrl } from "../lib/api";
import {
  addMember,
  deactivateMember,
  fetchMembers,
  promoteMember,
  reactivateMember,
  type Member,
} from "../lib/members";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});
const GROUP_ID = "11111111-1111-1111-1111-111111111111";

type Action = {
  label: string;
  run: (userId: string) => Promise<Member>;
};

// actionsFor returns the churn actions valid for a member's current state.
function actionsFor(m: Member): Action[] {
  if (m.status === "inactive") {
    return [{ label: "Reactivate", run: (id) => reactivateMember(API_URL, GROUP_ID, id) }];
  }
  if (m.role === "guest") {
    return [
      { label: "Promote", run: (id) => promoteMember(API_URL, GROUP_ID, id) },
      { label: "Deactivate", run: (id) => deactivateMember(API_URL, GROUP_ID, id) },
    ];
  }
  return [{ label: "Deactivate", run: (id) => deactivateMember(API_URL, GROUP_ID, id) }];
}

export default function ManageScreen() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [name, setName] = useState("");
  // The id of the member with an action in flight, or "add" while joining.
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await fetchMembers(API_URL, GROUP_ID, signal);
    setMembers(data);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        await load(controller.signal);
      } catch (e) {
        if (controller.signal.aborted) {
          return;
        }
        setError(e instanceof Error ? e.message : "failed to load members");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [load]);

  const onAdd = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed === "" || busy !== null) {
      return;
    }
    setBusy("add");
    setActionError(null);
    try {
      await addMember(API_URL, GROUP_ID, trimmed);
      setName("");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "failed to add member");
    } finally {
      setBusy(null);
    }
  }, [name, busy, load]);

  const onAction = useCallback(
    async (member: Member, action: Action) => {
      if (busy !== null) {
        return;
      }
      setBusy(member.id);
      setActionError(null);
      try {
        await action.run(member.id);
        await load();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : `failed to ${action.label.toLowerCase()}`);
      } finally {
        setBusy(null);
      }
    },
    [busy, load],
  );

  if (loading) {
    return <ActivityIndicator style={styles.center} size="large" />;
  }
  if (error !== null) {
    return (
      <Text style={[styles.center, styles.error]}>
        {`Couldn't load members: ${error}`}
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="New member name"
          value={name}
          onChangeText={setName}
          editable={busy === null}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={onAdd}
        />
        <Button title="Add" onPress={onAdd} disabled={busy !== null || name.trim() === ""} />
      </View>
      {actionError !== null && (
        <Text style={[styles.banner, styles.error]}>{actionError}</Text>
      )}
      <FlatList
        data={members}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => {
          const isBusy = busy === item.id;
          const tag = item.status === "inactive" ? "inactive" : item.role;
          return (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={[styles.name, item.status === "inactive" && styles.inactiveName]}>
                  {item.name}
                </Text>
                <Text style={styles.tag}>{tag}</Text>
              </View>
              <View style={styles.actions}>
                {isBusy ? (
                  <Text style={styles.meta}>Working…</Text>
                ) : (
                  actionsFor(item).map((a) => (
                    <Pressable
                      key={a.label}
                      onPress={() => onAction(item, a)}
                      disabled={busy !== null}
                      style={({ pressed }) => [styles.action, pressed && styles.rowPressed]}
                    >
                      <Text style={styles.actionText}>{a.label}</Text>
                    </Pressable>
                  ))
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  center: { marginTop: 32, textAlign: "center" },
  error: { color: "#b00020" },
  banner: { paddingVertical: 8, textAlign: "center" },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#999",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
  },
  rowMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: { fontSize: 18 },
  inactiveName: { color: "#999" },
  tag: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
  },
  actions: { flexDirection: "row", gap: 16, marginTop: 8 },
  action: { paddingVertical: 4 },
  actionText: { fontSize: 14, fontWeight: "600", color: "#0b66c3" },
  rowPressed: { opacity: 0.6 },
  meta: { fontSize: 14, color: "#666", marginTop: 8 },
});
```

- [ ] **Step 2: Run the gate**

Run: `cd mobile && just check`
Expected: lint clean, typecheck clean, tests pass.

- [ ] **Step 3: Commit**

```bash
cd mobile && git add app/manage.tsx
git commit -m "feat(mobile): manage-members screen (join/leave/return/promote)"
```

---

## Final verification (after all tasks)

- [ ] **Backend full gate + integration:** `cd backend && just check && just test-integration` → all green (integration needs the Podman runtime; `DOCKER_HOST` per `.env`).
- [ ] **Mobile full gate:** `cd mobile && just check` → all green.
- [ ] **Manual smoke:**
  1. `cd backend && just db-up && just migrate && just seed && just run`
  2. Join: `curl -i -X POST localhost:8080/groups/11111111-1111-1111-1111-111111111111/members -H 'Content-Type: application/json' -d '{"name":"Newbie"}'` → `201` with `{id,name,role:"core",status:"active"}`.
  3. Promote the seeded guest Frankie: `curl -i -X POST localhost:8080/groups/11111111-1111-1111-1111-111111111111/members/a0000000-0000-0000-0000-000000000006/promote` → `200`, `role:"core"`.
  4. Deactivate then reactivate: `curl -i -X POST .../members/a0000000-0000-0000-0000-000000000006/deactivate` → `200 inactive`; same URL `/reactivate` → `200 active`.
  5. Unknown user → 404: `curl -i -X POST .../members/a0000000-0000-0000-0000-0000000000ff/deactivate` → `404`.
  6. `cd mobile && just start-clean`, open the app, tap "Manage members", add a member (appears in the list), promote Frankie (badge flips to core), deactivate someone (greys out, Reactivate appears), reactivate them. Back on the turn screen, confirm the roster reflects the changes.
