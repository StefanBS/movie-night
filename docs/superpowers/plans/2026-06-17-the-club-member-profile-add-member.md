# The Club + Member profile + Add member — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Club tab (members in three sections), the pushed Member-profile screen, and the Add-member screen — wired to the existing backend plus two small additive API changes (a `role` param on `POST /members` for guests, and `joined_at` on the member DTO).

**Architecture:** Backend first (additive Go + SQL), then the pure mobile data layer (`lib/`, table-driven tests, no mocks), then the three screens reusing existing Spotlight primitives (`MemberRow`, `Stat`, `TopBar`, `Badge`, `Avatar`, `Input`, `AppButton`). Branchy display logic lives in pure `lib/` helpers; screens own their fetch with `AbortController` + `useFocusEffect`.

**Tech Stack:** Go 1.26 (stdlib `net/http`, sqlc, goose, testcontainers); Expo SDK 56 / React Native / TypeScript / expo-router; Node `node:test` via `tsx`.

**User decisions (already made):**
- "Allow small backend adds" — backend changes are in scope for this Phase-1 slice.
- "Build both [Core and Guest]" — Add-member supports guest creation via a `role` param.
- "Yes, expose joined_at" — member DTO gains `joinedOn` to power the profile's "since" line.
- "Empty-state placeholder" — the per-member picks list is a placeholder; history is deferred to #39. Profile stats fall back to `—` for non-rotation members.
- Add-member is a **pushed** screen (not a modal sheet), matching the handoff's `back="The Club"`.

---

### Task 1: Backend — `joined_at` on the member DTO

**Goal:** Every member JSON response carries a `joinedOn` date string, sourced from `memberships.joined_at`.

**Files:**
- Modify: `backend/internal/db/query/members.sql` (add `m.joined_at` to two queries)
- Regenerate: `backend/internal/db/` via `just sqlc`
- Modify: `backend/roster.go` (`memberResponse`, `toMemberResponses`)
- Modify: `backend/membership.go` (`encodeMember` signature + all call sites, new `memberDate` helper)
- Test: `backend/roster_integration_test.go`

**Acceptance Criteria:**
- [ ] `GET /groups/{id}/members` rows include `"joinedOn":"YYYY-MM-DD"`.
- [ ] Create and all three transition responses include `joinedOn`.
- [ ] `just check` passes (gofmt + vet + build + unit tests).

**Verify:** `cd backend && just check` → builds clean, tests pass.

**Steps:**

- [ ] **Step 1: Add `joined_at` to the two member-reading queries**

In `backend/internal/db/query/members.sql`, change `GetGroupMember`'s SELECT to include `m.joined_at`:

```sql
-- name: GetGroupMember :one
SELECT u.id AS user_id, u.name, m.role, m.status, m.baseline_picks, m.joined_at
FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE m.group_id = sqlc.arg(group_id) AND m.user_id = sqlc.arg(user_id);
```

And in `backend/internal/db/query/roster.sql`, add `m.joined_at` to `ListGroupMembers`:

```sql
-- name: ListGroupMembers :many
SELECT u.id, u.name, m.role, m.status, m.joined_at
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

- [ ] **Step 2: Regenerate sqlc**

Run: `cd backend && just sqlc`
Expected: `internal/db/roster.sql.go` and `internal/db/members.sql.go` regenerate; `ListGroupMembersRow` and `GetGroupMemberRow` now have a `JoinedAt pgtype.Timestamptz` field. Do not hand-edit generated files.

- [ ] **Step 3: Add the `memberDate` helper and extend `memberResponse`**

In `backend/membership.go`, add near `encodeMember` (the file already imports `pgtype`):

```go
// memberDate formats a membership's joined_at as a YYYY-MM-DD string — the same
// date encoding the turn handler uses for lastPickedOn. An unset timestamp (no
// row) yields "", though joined_at is NOT NULL in practice.
func memberDate(ts pgtype.Timestamptz) string {
	if !ts.Valid {
		return ""
	}
	return ts.Time.Format("2006-01-02")
}
```

In `backend/roster.go`, add the field to the struct:

```go
type memberResponse struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	Status   string `json:"status"`
	JoinedOn string `json:"joinedOn"`
}
```

- [ ] **Step 4: Populate `joinedOn` in `toMemberResponses`**

In `backend/roster.go`:

```go
func toMemberResponses(rows []db.ListGroupMembersRow) []memberResponse {
	out := make([]memberResponse, 0, len(rows))
	for _, r := range rows {
		out = append(out, memberResponse{
			ID:       r.ID.String(),
			Name:     r.Name,
			Role:     string(r.Role),
			Status:   string(r.Status),
			JoinedOn: memberDate(r.JoinedAt),
		})
	}
	return out
}
```

- [ ] **Step 5: Thread `joinedOn` through `encodeMember` and every call site**

In `backend/membership.go`, change the signature and body:

```go
// encodeMember writes a member DTO as JSON with the given status code.
func encodeMember(w http.ResponseWriter, gid, userID uuid.UUID, name, role, status, joinedOn string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(memberResponse{
		ID:       userID.String(),
		Name:     name,
		Role:     role,
		Status:   status,
		JoinedOn: joinedOn,
	}); err != nil {
		log.Printf("encode member response (%s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID
	}
}
```

Update all six call sites (the join handler's final encode is touched again in Task 2, so leave its current form; here just add the new arg):

- Join handler (final line): `encodeMember(w, gid, user.ID, user.Name, string(membership.Role), string(membership.Status), memberDate(membership.JoinedAt), http.StatusCreated)`
- `deactivateMemberHandler` idempotent branch: `encodeMember(w, gid, m.UserID, m.Name, string(m.Role), string(m.Status), memberDate(m.JoinedAt), http.StatusOK)`
- `deactivateMemberHandler` final: `encodeMember(w, gid, updated.UserID, m.Name, string(updated.Role), string(updated.Status), memberDate(updated.JoinedAt), http.StatusOK)`
- `reactivateMemberHandler` idempotent branch: `encodeMember(w, gid, m.UserID, m.Name, string(m.Role), string(m.Status), memberDate(m.JoinedAt), http.StatusOK)`
- `reactivateMemberHandler` final: `encodeMember(w, gid, updated.UserID, m.Name, string(updated.Role), string(updated.Status), memberDate(updated.JoinedAt), http.StatusOK)`
- `promoteMemberHandler` idempotent branch + final: same pattern — `memberDate(m.JoinedAt)` for the no-op branch, `memberDate(updated.JoinedAt)` for the post-transition encode.

(`GetGroupMemberRow` now has `JoinedAt` from Step 2, so `m.JoinedAt` compiles; the transition `Membership` results already RETURN `joined_at`.)

- [ ] **Step 6: Assert `joinedOn` in the roster integration test**

In `backend/roster_integration_test.go`, inside `TestMembersHandlerIntegration` → "all members ordered..." subtest, after the existing per-row field checks, add a format assertion:

```go
		for i := range got {
			if len(got[i].JoinedOn) != len("2006-01-02") {
				t.Errorf("[%d] %s joinedOn = %q, want a YYYY-MM-DD date", i, got[i].Name, got[i].JoinedOn)
			}
		}
```

- [ ] **Step 7: Verify and commit**

Run: `cd backend && just check`
Expected: PASS. Then:

```bash
git add backend/internal/db backend/roster.go backend/membership.go backend/roster_integration_test.go
git commit -m "feat(backend): expose joinedOn on the member DTO (#34)"
```

---

### Task 2: Backend — `role` param on `POST /members` (guest creation)

**Goal:** `POST /groups/{id}/members` accepts an optional `role` (`core`|`guest`, default `core`) and creates a guest membership that stays out of the rotation.

**Files:**
- Modify: `backend/membership.go` (`joinRequest`, `validateJoin`, `joinMemberHandler`)
- Test: `backend/membership_test.go` (replace `TestValidateJoinName`)
- Test: `backend/membership_integration_test.go`

**Acceptance Criteria:**
- [ ] `POST` with `{"name":"X","role":"guest"}` returns `role:"guest"` and the member is absent from `GET /turn`.
- [ ] `POST` with `{"name":"X"}` (role omitted) still creates an active core member present in `/turn`.
- [ ] `POST` with an invalid role returns 400.
- [ ] `just check` passes.

**Verify:** `cd backend && just check` → PASS; `just test-integration` covers the guest path.

**Steps:**

- [ ] **Step 1: Write the failing unit test for `validateJoin`**

In `backend/membership_test.go`, replace `TestValidateJoinName` with:

```go
func TestValidateJoin(t *testing.T) {
	t.Run("trims name and defaults role to core", func(t *testing.T) {
		name, role, err := validateJoin(joinRequest{Name: "  Ada  "})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if name != "Ada" || role != "core" {
			t.Errorf("got (%q, %q), want (\"Ada\", \"core\")", name, role)
		}
	})
	t.Run("accepts an explicit guest role", func(t *testing.T) {
		_, role, err := validateJoin(joinRequest{Name: "Bo", Role: "guest"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if role != "guest" {
			t.Errorf("role = %q, want \"guest\"", role)
		}
	})
	for _, tc := range []struct{ name string; req joinRequest }{
		{name: "empty name", req: joinRequest{Name: ""}},
		{name: "whitespace name", req: joinRequest{Name: "   "}},
		{name: "unknown role", req: joinRequest{Name: "Ada", Role: "admin"}},
	} {
		t.Run("rejects "+tc.name, func(t *testing.T) {
			if _, _, err := validateJoin(tc.req); err == nil {
				t.Fatal("expected error, got nil")
			}
		})
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && go test -run '^TestValidateJoin$' ./...`
Expected: FAIL (`undefined: validateJoin`).

- [ ] **Step 3: Add the `Role` field and `validateJoin`**

In `backend/membership.go`, extend the request struct and replace `validateJoinName`:

```go
// joinRequest is the JSON body of POST /groups/{groupId}/members. Role is
// optional and defaults to "core" (the historical behavior).
type joinRequest struct {
	Name string `json:"name"`
	Role string `json:"role"`
}

// validateJoin trims and requires a non-empty name, and resolves the role:
// empty defaults to "core", otherwise it must be "core" or "guest". Pure.
func validateJoin(req joinRequest) (name, role string, err error) {
	name = strings.TrimSpace(req.Name)
	if name == "" {
		return "", "", fmt.Errorf("name is required")
	}
	role = req.Role
	if role == "" {
		role = string(db.MembershipRoleCore)
	}
	if role != string(db.MembershipRoleCore) && role != string(db.MembershipRoleGuest) {
		return "", "", fmt.Errorf("role must be \"core\" or \"guest\"")
	}
	return name, role, nil
}
```

- [ ] **Step 4: Branch the join handler on role**

In `backend/membership.go`, replace the body of `joinMemberHandler` from the `validateJoinName` call through the `InsertMembership` call. Guests skip the avg/maxPos reads and get a zero baseline/position (the turn query filters to `role=core`, so those values are inert for a guest):

```go
		name, role, err := validateJoin(req)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}

		ctx := r.Context()

		// Guests never enter the rotation: skip the seed/position reads and
		// stamp inert zero values. Core members seed to the active-core average
		// and take the next rotation slot (the original behavior).
		baseline := int32(0)
		position := int32(0)
		if role == string(db.MembershipRoleCore) {
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
			baseline = seedBaseline(avg, 0)
			position = maxPos + 1
		}

		user, err := store.CreateUser(ctx, name)
		if err != nil {
			internalError(w, gid, "create user", err)
			return
		}
		membership, err := store.InsertMembership(ctx, db.InsertMembershipParams{
			GroupID:          gid,
			UserID:           user.ID,
			Role:             db.MembershipRole(role),
			Status:           db.MembershipStatusActive,
			BaselinePicks:    baseline,
			RotationPosition: position,
		})
		if err != nil {
			internalError(w, gid, "insert membership", err)
			return
		}

		encodeMember(w, gid, user.ID, user.Name, string(membership.Role), string(membership.Status), memberDate(membership.JoinedAt), http.StatusCreated)
```

Keep the existing explanatory comment block about read-then-write above the core branch (it still applies to the core path).

- [ ] **Step 5: Run the unit test to verify it passes**

Run: `cd backend && go test -run '^TestValidateJoin$' ./...`
Expected: PASS.

- [ ] **Step 6: Add a guest-join integration test**

In `backend/membership_integration_test.go`, add a subtest (the `do` and `getTurn`/`servedOf` helpers already exist in this test):

```go
	t.Run("guest join is created as a guest and stays out of the rotation", func(t *testing.T) {
		code, m := do(t, http.MethodPost, "/groups/"+seededGroup+"/members", `{"name":"Guesty","role":"guest"}`)
		if code != http.StatusCreated {
			t.Fatalf("status = %d, want 201", code)
		}
		if m.Name != "Guesty" || m.Role != "guest" || m.Status != "active" || m.ID == "" {
			t.Fatalf("response = %+v", m)
		}
		if m.JoinedOn == "" {
			t.Error("guest response missing joinedOn")
		}
		if _, ok := servedOf(t, "Guesty"); ok {
			t.Error("Guesty should not appear in /turn (guests are not in the rotation)")
		}
	})

	t.Run("invalid role is rejected", func(t *testing.T) {
		code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/members", `{"name":"Nope","role":"admin"}`)
		if code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", code)
		}
	})
```

- [ ] **Step 7: Verify and commit**

Run: `cd backend && just check` (and `just test-integration` if a container runtime is up)
Expected: PASS. Then:

```bash
git add backend/membership.go backend/membership_test.go backend/membership_integration_test.go
git commit -m "feat(backend): accept role on POST /members for guest creation (#34)"
```

---

### Task 3: Mobile data layer — `members.ts` (`joinedOn` + `role`)

**Goal:** The `Member` type carries `joinedOn`, the parser validates it, and `joinMember` sends a `role`.

**Files:**
- Modify: `mobile/lib/members.ts`
- Test: `mobile/lib/members.test.ts`
- Test: `mobile/lib/members.integration.test.ts`

**Acceptance Criteria:**
- [ ] `parseMember` requires `joinedOn` to be a string (descriptive throw otherwise).
- [ ] `joinMember(base, group, name, role)` POSTs `{ name, role }`.
- [ ] `just check` (mobile) passes.

**Verify:** `cd mobile && node --import tsx --test lib/members.test.ts` → PASS; then `just check`.

**Steps:**

- [ ] **Step 1: Write the failing test additions**

In `mobile/lib/members.test.ts`, update the valid-array fixtures to include `joinedOn` and add a rejection case. Replace the first two `test(...)` blocks' fixtures so each member object has `joinedOn`, and add to the `invalid` array:

```ts
  {
    name: "rejects a missing joinedOn",
    raw: [{ id: "a", name: "Ada", role: "core", status: "active" }],
    wantError: /member 0.*joinedOn/,
  },
```

And update the "parses a valid array" fixtures, e.g.:

```ts
  const raw = [
    { id: "a", name: "Ada", role: "core", status: "active", joinedOn: "2024-06-15" },
    { id: "b", name: "Bo", role: "guest", status: "inactive", joinedOn: "2025-01-02" },
  ];
  const want: Member[] = [
    { id: "a", name: "Ada", role: "core", status: "active", joinedOn: "2024-06-15" },
    { id: "b", name: "Bo", role: "guest", status: "inactive", joinedOn: "2025-01-02" },
  ];
```

- [ ] **Step 2: Run to verify failure**

Run: `cd mobile && node --import tsx --test lib/members.test.ts`
Expected: FAIL (type error / missing `joinedOn` validation).

- [ ] **Step 3: Add `joinedOn` to the type and parser**

In `mobile/lib/members.ts`, extend the type and `parseMember`:

```ts
export type Member = {
  id: string;
  name: string;
  role: "core" | "guest";
  status: "active" | "inactive";
  joinedOn: string;
};
```

Inside `parseMember`, destructure `joinedOn` and validate it before the `return`:

```ts
  const { id, name, role, status, joinedOn } = raw as Record<string, unknown>;
```

```ts
  if (typeof joinedOn !== "string") {
    throw new Error(`member ${index}: joinedOn must be a string`);
  }
  return { id, name, role, status, joinedOn };
```

- [ ] **Step 4: Add the `role` param to `joinMember`**

In `mobile/lib/members.ts`:

```ts
// joinMember adds a new member by name with the given role (core enters the
// rotation; guest watches but never picks). Returns the created Member.
export function joinMember(
  baseUrl: string,
  groupId: string,
  name: string,
  role: "core" | "guest",
  signal?: AbortSignal,
): Promise<Member> {
  return postMember(`${baseUrl}/groups/${groupId}/members`, { name, role }, signal);
}
```

- [ ] **Step 5: Update the integration test**

In `mobile/lib/members.integration.test.ts`, any `Member` fixtures must include `joinedOn`, and the `joinMember` call gains a role. Find the `joinMember` invocation and pass a role (e.g. `"core"`); update the asserted request body to `{"name":...,"role":"core"}`. Add `joinedOn` to every canned `Member` returned by the fake server.

- [ ] **Step 6: Verify and commit**

Run: `cd mobile && just check`
Expected: PASS. Then:

```bash
git add mobile/lib/members.ts mobile/lib/members.test.ts mobile/lib/members.integration.test.ts
git commit -m "feat(mobile): members.ts carries joinedOn and joinMember takes a role (#34)"
```

---

### Task 4: Mobile data layer — `lib/club.ts`

**Goal:** Pure helpers that shape `/members` + `/turn` into the Club sections, the header summary, and a member-profile lookup.

**Files:**
- Create: `mobile/lib/club.ts`
- Test: `mobile/lib/club.test.ts`

**Acceptance Criteria:**
- [ ] `buildClubSections` splits into `inRotation` (turn as-is), `guests` (active guests), `inactive`.
- [ ] `clubSummary` returns `"N members · M in rotation"` with correct pluralization.
- [ ] `memberProfile` returns the member + its turn entry + 1-based rank (or nulls), or `null` if not found.
- [ ] `just check` passes.

**Verify:** `cd mobile && node --import tsx --test lib/club.test.ts` → PASS.

**Steps:**

- [ ] **Step 1: Write the failing tests**

Create `mobile/lib/club.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildClubSections, clubSummary, memberProfile } from "./club";
import type { Member } from "./members";
import type { TurnMember } from "./turn";

const members: Member[] = [
  { id: "a", name: "Ada", role: "core", status: "active", joinedOn: "2024-01-01" },
  { id: "b", name: "Bo", role: "core", status: "active", joinedOn: "2024-02-01" },
  { id: "g", name: "Gus", role: "guest", status: "active", joinedOn: "2024-03-01" },
  { id: "z", name: "Zed", role: "core", status: "inactive", joinedOn: "2023-01-01" },
];
const turn: TurnMember[] = [
  { id: "a", name: "Ada", role: "core", servedCount: 0, lastPickedOn: null },
  { id: "b", name: "Bo", role: "core", servedCount: 2, lastPickedOn: "2026-05-30" },
];

test("buildClubSections splits into rotation, guests, inactive", () => {
  const s = buildClubSections(members, turn);
  assert.deepEqual(s.inRotation, turn);
  assert.deepEqual(s.guests.map((m) => m.id), ["g"]);
  assert.deepEqual(s.inactive.map((m) => m.id), ["z"]);
});

test("clubSummary counts active members and the rotation", () => {
  assert.equal(clubSummary(members, turn), "3 members · 2 in rotation");
});

test("clubSummary uses the singular for one member", () => {
  const one: Member[] = [members[0]];
  const t1: TurnMember[] = [turn[0]];
  assert.equal(clubSummary(one, t1), "1 member · 1 in rotation");
});

test("memberProfile resolves an in-rotation member with rank", () => {
  const p = memberProfile(members, turn, "b");
  assert.equal(p?.member.id, "b");
  assert.equal(p?.turn?.servedCount, 2);
  assert.equal(p?.rank, 2);
});

test("memberProfile resolves a guest with null turn and rank", () => {
  const p = memberProfile(members, turn, "g");
  assert.equal(p?.member.id, "g");
  assert.equal(p?.turn, null);
  assert.equal(p?.rank, null);
});

test("memberProfile returns null when the id is unknown", () => {
  assert.equal(memberProfile(members, turn, "nope"), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd mobile && node --import tsx --test lib/club.test.ts`
Expected: FAIL (`Cannot find module './club'`).

- [ ] **Step 3: Implement `lib/club.ts`**

Create `mobile/lib/club.ts`:

```ts
import type { Member } from "./members";
import type { TurnMember } from "./turn";

// The Club screen's three sections. `inRotation` is the turn ranking as-is
// (active core only, already ordered); guests and inactive come from the full
// roster, which the turn endpoint omits.
export type ClubSections = {
  inRotation: TurnMember[];
  guests: Member[];
  inactive: Member[];
};

// buildClubSections shapes the roster + turn ranking into the Club's sections.
export function buildClubSections(
  members: Member[],
  turn: TurnMember[],
): ClubSections {
  return {
    inRotation: turn,
    guests: members.filter((m) => m.role === "guest" && m.status === "active"),
    inactive: members.filter((m) => m.status === "inactive"),
  };
}

// clubSummary is the tab bar's mono sub: active-member count · rotation size.
export function clubSummary(members: Member[], turn: TurnMember[]): string {
  const active = members.filter((m) => m.status === "active").length;
  const noun = active === 1 ? "member" : "members";
  return `${active} ${noun} · ${turn.length} in rotation`;
}

// MemberProfile is one member plus their rotation standing, if any: the turn
// entry (stats) and 1-based rank are null for guests and inactive members,
// who are not in the rotation.
export type MemberProfile = {
  member: Member;
  turn: TurnMember | null;
  rank: number | null;
};

// memberProfile looks a member up by id, attaching their turn entry and rank
// when they are in the rotation. Returns null if no member matches.
export function memberProfile(
  members: Member[],
  turn: TurnMember[],
  id: string,
): MemberProfile | null {
  const member = members.find((m) => m.id === id);
  if (member === undefined) {
    return null;
  }
  const index = turn.findIndex((t) => t.id === id);
  if (index === -1) {
    return { member, turn: null, rank: null };
  }
  return { member, turn: turn[index], rank: index + 1 };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd mobile && node --import tsx --test lib/club.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/club.ts mobile/lib/club.test.ts
git commit -m "feat(mobile): club.ts section + profile shaping helpers (#34)"
```

---

### Task 5: Mobile data layer — `formatMonthYear`

**Goal:** A pure `"2024-06-15" → "Jun 2024"` formatter for the profile's "since" line.

**Files:**
- Modify: `mobile/lib/date.ts`
- Test: `mobile/lib/date.test.ts`

**Acceptance Criteria:**
- [ ] `formatMonthYear("2024-06-15") === "Jun 2024"`.
- [ ] Timezone-independent (string split, no `Date` parsing).
- [ ] `just check` passes.

**Verify:** `cd mobile && node --import tsx --test lib/date.test.ts` → PASS.

**Steps:**

- [ ] **Step 1: Write the failing test**

In `mobile/lib/date.test.ts`, add:

```ts
test("formatMonthYear renders a month-and-year label", () => {
  assert.equal(formatMonthYear("2024-06-15"), "Jun 2024");
  assert.equal(formatMonthYear("2023-12-01"), "Dec 2023");
});
```

Ensure `formatMonthYear` is added to the existing import from `./date` at the top of the test file.

- [ ] **Step 2: Run to verify failure**

Run: `cd mobile && node --import tsx --test lib/date.test.ts`
Expected: FAIL (`formatMonthYear is not a function`).

- [ ] **Step 3: Implement `formatMonthYear`**

In `mobile/lib/date.ts`, add (reusing the existing `SHORT_MONTHS` array):

```ts
// formatMonthYear turns a YYYY-MM-DD string into a "Jun 2024" label. Like
// formatShortDate, it splits the ISO string by hand so it stays timezone-
// independent. Used for the member profile's "since" line.
export function formatMonthYear(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return `${SHORT_MONTHS[month - 1]} ${year}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd mobile && node --import tsx --test lib/date.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/date.ts mobile/lib/date.test.ts
git commit -m "feat(mobile): formatMonthYear for the profile since-line (#34)"
```

---

### Task 6: Mobile component — `IconButton` accent variant

**Goal:** `IconButton` gains a solid-ember `variant="accent"` for the Club's add-member plus.

**Files:**
- Modify: `mobile/components/IconButton.tsx`

**Acceptance Criteria:**
- [ ] `variant="accent"` renders an `accent.base` fill with an ember shadow.
- [ ] Existing `card`/`ghost` variants unchanged.
- [ ] `just typecheck` + `just lint` pass.

**Verify:** `cd mobile && just typecheck && just lint` → PASS.

**Steps:**

- [ ] **Step 1: Extend the variant union and styles**

In `mobile/components/IconButton.tsx`, change the prop type to `variant?: "card" | "ghost" | "accent"`, add `variant === "accent" && styles.accent` to the style array (alongside the existing `variant === "card" && styles.card`), import `shadow` from `../theme`, and add to the `StyleSheet`:

```ts
  accent: {
    backgroundColor: colors.accent.base,
    ...shadow.spotlight,
  },
```

- [ ] **Step 2: Verify and commit**

Run: `cd mobile && just typecheck && just lint`
Expected: PASS. Then:

```bash
git add mobile/components/IconButton.tsx
git commit -m "feat(mobile): IconButton accent variant for the add-member plus (#34)"
```

---

### Task 7: Mobile screen — The Club tab

**Goal:** Replace the Club placeholder with the real members screen: header summary + add button, and three sections that push to a profile.

**Files:**
- Modify: `mobile/app/(tabs)/club.tsx`

**Acceptance Criteria:**
- [ ] Fetches `/members` + `/turn` in parallel; loading/error/empty states mirror `rotation.tsx`.
- [ ] In-rotation rows show rank + `pickerMeta`, rank 1 a "Next up" badge; guests show a neutral "Guest" badge; inactive rows are dimmed.
- [ ] Tapping any row pushes `/member/{id}`; the add button pushes `/member/new`.
- [ ] Re-fetches on focus (so a new member / transition shows on return).
- [ ] `just check` passes.

**Verify:** `cd mobile && just check` → PASS (typecheck + lint + tests).

**Steps:**

- [ ] **Step 1: Replace `mobile/app/(tabs)/club.tsx`**

```tsx
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Constants from "expo-constants";
import { ChevronRight, Plus } from "lucide-react-native";

import {
  Badge,
  IconButton,
  MemberRow,
  SectionLabel,
  TopBar,
} from "../../components";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { fetchMembers, type Member } from "../../lib/members";
import { fetchTurn, pickerMeta, type TurnMember } from "../../lib/turn";
import { buildClubSections, clubSummary } from "../../lib/club";
import { colors, space, textPresets } from "../../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

export default function ClubScreen() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [turn, setTurn] = useState<TurnMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      (async () => {
        try {
          const [m, t] = await Promise.all([
            fetchMembers(API_URL, GROUP_ID, controller.signal),
            fetchTurn(API_URL, GROUP_ID, controller.signal),
          ]);
          setMembers(m);
          setTurn(t);
          setError(null);
        } catch (e) {
          if (!controller.signal.aborted) {
            setError(errorMessage(e, "failed to load the club"));
          }
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        }
      })();
      return () => controller.abort();
    }, []),
  );

  const sections = buildClubSections(members, turn);
  const open = (id: string) => router.push(`/member/${id}`);

  return (
    <View style={styles.screen}>
      <TopBar
        kind="tab"
        title="The Club"
        sub={loading || error !== null ? undefined : clubSummary(members, turn)}
        right={
          <IconButton
            variant="accent"
            accessibilityLabel="Add member"
            onPress={() => router.push("/member/new")}
            icon={<Plus size={20} color={colors.text.onAccent} strokeWidth={2.4} />}
          />
        }
      />
      {loading ? (
        <ActivityIndicator style={styles.center} size="large" color={colors.accent.base} />
      ) : error !== null ? (
        <Text style={[styles.center, styles.error]}>{`Couldn't load the club: ${error}`}</Text>
      ) : members.length === 0 ? (
        <View style={styles.body}>
          <Text style={styles.empty}>{"No one's in the club yet."}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <SectionLabel>In rotation</SectionLabel>
          <View>
            {sections.inRotation.map((m, i) => (
              <View
                key={m.id}
                style={i < sections.inRotation.length - 1 ? styles.divider : undefined}
              >
                <MemberRow
                  rank={i + 1}
                  name={m.name}
                  meta={pickerMeta(m)}
                  spotlight={i === 0}
                  onPress={() => open(m.id)}
                  right={
                    i === 0 ? (
                      <Badge label="Next up" />
                    ) : (
                      <ChevronRight size={18} color={colors.text.tertiary} />
                    )
                  }
                />
              </View>
            ))}
          </View>

          {sections.guests.length > 0 ? (
            <>
              <SectionLabel>Guests · not in rotation</SectionLabel>
              <View>
                {sections.guests.map((m, i) => (
                  <View
                    key={m.id}
                    style={i < sections.guests.length - 1 ? styles.divider : undefined}
                  >
                    <MemberRow
                      name={m.name}
                      onPress={() => open(m.id)}
                      right={<Badge label="Guest" tone="neutral" />}
                    />
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {sections.inactive.length > 0 ? (
            <>
              <SectionLabel>Inactive</SectionLabel>
              <View style={styles.dimmed}>
                {sections.inactive.map((m, i) => (
                  <View
                    key={m.id}
                    style={i < sections.inactive.length - 1 ? styles.divider : undefined}
                  >
                    <MemberRow
                      name={m.name}
                      onPress={() => open(m.id)}
                      right={<ChevronRight size={18} color={colors.text.tertiary} />}
                    />
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  center: { flex: 1, textAlignVertical: "center" },
  content: { paddingHorizontal: space[5], paddingBottom: space[10] },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.hairline,
  },
  dimmed: { opacity: 0.55 },
  empty: { ...textPresets.body, color: colors.text.secondary },
  error: { ...textPresets.body, color: colors.accent.strong, textAlign: "center", paddingHorizontal: space[5] },
});
```

(The rows use `MemberRow`'s built-in avatar, so `Avatar` is intentionally not imported here.)

- [ ] **Step 2: Verify and commit**

Run: `cd mobile && just check`
Expected: PASS (the `/member/...` routes don't exist yet but `router.push` takes a string, so typecheck is clean). Then:

```bash
git add mobile/app/\(tabs\)/club.tsx
git commit -m "feat(mobile): The Club tab — rotation, guests, inactive sections (#34)"
```

---

### Task 8: Mobile screen — Member profile (`member/[id].tsx`)

**Goal:** A pushed profile screen: avatar/name/role/since, a stats card, a picks-list placeholder, and transition actions.

**Files:**
- Create: `mobile/app/member/[id].tsx`
- Modify: `mobile/app/_layout.tsx` (register the route)

**Acceptance Criteria:**
- [ ] Loads `/members` + `/turn`, resolves the member by route id (member-not-found → error state).
- [ ] Header: 76px avatar, serif name, role badge, "since `<Mon Year>`".
- [ ] Stats card: Picks / Last pick / In line — real for in-rotation members, `—` fallback otherwise.
- [ ] Picks list shows the empty-state placeholder (deferred to #39).
- [ ] Footer renders one button per `memberActions(member)`; pressing it calls `transitionMember` then `router.back()`.
- [ ] `just check` passes.

**Verify:** `cd mobile && just check` → PASS.

**Steps:**

- [ ] **Step 1: Register the route in `mobile/app/_layout.tsx`**

Add inside the `<Stack>`, after the `rotation` screen:

```tsx
        <Stack.Screen name="member/[id]" options={{ headerShown: false }} />
```

- [ ] **Step 2: Create `mobile/app/member/[id].tsx`**

```tsx
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";

import { AppButton, Avatar, Badge, SectionLabel, Stat, TopBar } from "../../components";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import {
  fetchMembers,
  memberActions,
  transitionMember,
  type Member,
  type MemberAction,
} from "../../lib/members";
import { fetchTurn } from "../../lib/turn";
import { memberProfile, type MemberProfile } from "../../lib/club";
import { formatMonthYear, formatShortDate } from "../../lib/date";
import {
  borderWidth,
  colors,
  radius,
  space,
  textPresets,
} from "../../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

const ACTION_LABEL: Record<MemberAction, string> = {
  deactivate: "Deactivate",
  reactivate: "Reactivate",
  promote: "Promote to core",
};

function StatsCard({ profile }: { profile: MemberProfile }) {
  const t = profile.turn;
  const picks = t ? String(t.servedCount) : "—";
  const last = t && t.lastPickedOn ? formatShortDate(t.lastPickedOn) : "—";
  const inLine = profile.rank != null ? `#${profile.rank}` : "—";
  return (
    <View style={styles.stats}>
      <View style={styles.statCell}>
        <Stat value={picks} label="Picks" />
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statCell}>
        <Stat value={last} label="Last pick" />
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statCell}>
        <Stat value={inLine} label="In line" accent />
      </View>
    </View>
  );
}

export default function MemberProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      (async () => {
        try {
          const [m, t] = await Promise.all([
            fetchMembers(API_URL, GROUP_ID, controller.signal),
            fetchTurn(API_URL, GROUP_ID, controller.signal),
          ]);
          setProfile(memberProfile(m, t, id));
          setError(null);
        } catch (e) {
          if (!controller.signal.aborted) {
            setError(errorMessage(e, "failed to load the member"));
          }
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        }
      })();
      return () => controller.abort();
    }, [id]),
  );

  const act = async (member: Member, action: MemberAction) => {
    setBusy(true);
    try {
      await transitionMember(API_URL, GROUP_ID, member.id, action);
      router.back();
    } catch (e) {
      setError(errorMessage(e, "couldn't update the member"));
      setBusy(false);
    }
  };

  const back = { label: "The Club", onPress: () => router.back() };
  const member = profile?.member;

  return (
    <View style={styles.screen}>
      <TopBar kind="title" title="" back={back} />
      {loading ? (
        <ActivityIndicator style={styles.center} size="large" color={colors.accent.base} />
      ) : error !== null ? (
        <Text style={[styles.center, styles.error]}>{`Couldn't load the member: ${error}`}</Text>
      ) : member === undefined || profile === null ? (
        <View style={styles.body}>
          <Text style={styles.empty}>{"That member isn't in the club."}</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <Avatar name={member.name} size={76} />
              <Text style={styles.name}>{member.name}</Text>
              <View style={styles.subRow}>
                <Badge label={member.role === "core" ? "Core" : "Guest"} tone="neutral" />
                <Text style={styles.since}>{`since ${formatMonthYear(member.joinedOn)}`}</Text>
              </View>
            </View>

            <StatsCard profile={profile} />

            <SectionLabel>{`${member.name.split(" ")[0]}'s picks`}</SectionLabel>
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                {"Their picks will appear here once night history lands."}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {memberActions(member).map((action) => (
              <AppButton
                key={action}
                title={ACTION_LABEL[action]}
                variant={action === "deactivate" ? "secondary" : "primary"}
                fullWidth
                disabled={busy}
                onPress={() => act(member, action)}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  center: { flex: 1, textAlignVertical: "center" },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  content: { paddingHorizontal: space[5], paddingBottom: space[10] },
  header: { alignItems: "center", marginTop: space[2] },
  name: { ...textPresets.screenTitle, color: colors.text.primary, marginTop: space[3] },
  subRow: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[2] },
  since: { ...textPresets.barMeta, color: colors.text.tertiary },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
    borderRadius: radius.lg,
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    marginTop: space[5],
  },
  statCell: { flex: 1, alignItems: "center" },
  statDivider: { width: borderWidth.hairline, alignSelf: "stretch", backgroundColor: colors.border.hairline },
  placeholder: {
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
    borderRadius: radius.md,
    padding: space[4],
  },
  placeholderText: { ...textPresets.body, color: colors.text.tertiary },
  footer: {
    paddingHorizontal: space[5],
    paddingTop: space[3],
    paddingBottom: space[8],
    gap: space[2],
  },
  empty: { ...textPresets.body, color: colors.text.secondary },
  error: { ...textPresets.body, color: colors.accent.strong, textAlign: "center", paddingHorizontal: space[5] },
});
```

Note: `textPresets.screenTitle` is confirmed present in `mobile/theme/typography.ts`. `picksLabel` is deliberately not imported — the stats card formats `servedCount` directly.

- [ ] **Step 3: Verify and commit**

Run: `cd mobile && just check`
Expected: PASS. Then:

```bash
git add mobile/app/member/\[id\].tsx mobile/app/_layout.tsx
git commit -m "feat(mobile): member profile — stats, picks placeholder, transitions (#34)"
```

---

### Task 9: Mobile screen — Add member (`member/new.tsx`)

**Goal:** A pushed screen with a name input and a Core/Guest selectable-card choice that creates a member via `joinMember`.

**Files:**
- Create: `mobile/app/member/new.tsx`
- Modify: `mobile/app/_layout.tsx` (register the route)

**Acceptance Criteria:**
- [ ] Name `Input` + two selectable cards (Core / Guest); the selected card gets the spotlight wash + ember border + check.
- [ ] Footer "Add to the club" is disabled while the name is empty or a request is in flight.
- [ ] On success calls `joinMember(..., role)` then `router.back()`; on failure shows an inline error and stays.
- [ ] `just check` passes.

**Verify:** `cd mobile && just check` → PASS.

**Steps:**

- [ ] **Step 1: Register the route in `mobile/app/_layout.tsx`**

Add inside the `<Stack>`, after the `member/[id]` screen:

```tsx
        <Stack.Screen name="member/new" options={{ headerShown: false }} />
```

- [ ] **Step 2: Create `mobile/app/member/new.tsx`**

```tsx
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { Check } from "lucide-react-native";

import { AppButton, Input, SectionLabel, TopBar } from "../../components";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { joinMember } from "../../lib/members";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  radius,
  space,
  textPresets,
} from "../../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

type Role = "core" | "guest";

const ROLES: { id: Role; label: string; note: string }[] = [
  { id: "core", label: "Core", note: "Enters the pick rotation" },
  { id: "guest", label: "Guest", note: "Watches, never picks" },
];

function RoleCard({
  label,
  note,
  selected,
  onPress,
}: {
  label: string;
  note: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.card, selected ? styles.cardOn : styles.cardOff]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardLabel}>{label}</Text>
        {selected ? <Check size={17} color={colors.accent.strong} strokeWidth={2.4} /> : null}
      </View>
      <Text style={styles.cardNote}>{note}</Text>
    </Pressable>
  );
}

export default function AddMemberScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("core");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed === "" || busy) {
      return;
    }
    setBusy(true);
    try {
      await joinMember(API_URL, GROUP_ID, trimmed, role);
      router.back();
    } catch (e) {
      setError(errorMessage(e, "couldn't add the member"));
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TopBar
        kind="title"
        title="Add member"
        back={{ label: "The Club", onPress: () => router.back() }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel>Their name</SectionLabel>
        <Input
          value={name}
          onChangeText={setName}
          placeholder="e.g. Alex Rivera"
          autoFocus
          onSubmitEditing={submit}
        />

        <SectionLabel>Join as</SectionLabel>
        <View style={styles.cards}>
          {ROLES.map((r) => (
            <RoleCard
              key={r.id}
              label={r.label}
              note={r.note}
              selected={role === r.id}
              onPress={() => setRole(r.id)}
            />
          ))}
        </View>

        <Text style={styles.helper}>
          {"New core members start with zero picks, so they'll come up first — that's the rotation keeping things fair."}
        </Text>

        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <AppButton
          title="Add to the club"
          fullWidth
          disabled={name.trim() === "" || busy}
          onPress={submit}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  content: { paddingHorizontal: space[5], paddingBottom: space[10] },
  cards: { flexDirection: "row", gap: space[3] },
  card: { flex: 1, borderRadius: radius.md, padding: space[4] },
  cardOff: {
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
  },
  cardOn: {
    backgroundColor: colors.surface.spotlight,
    borderWidth: 1.5,
    borderColor: colors.accent.base,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLabel: { ...textPresets.rowName, color: colors.text.primary },
  cardNote: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.text.secondary,
    marginTop: space[2],
  },
  helper: { ...textPresets.body, color: colors.text.tertiary, marginTop: space[5] },
  error: { ...textPresets.body, color: colors.accent.strong, marginTop: space[4] },
  footer: {
    paddingHorizontal: space[5],
    paddingTop: space[3],
    paddingBottom: space[8],
  },
});
```

- [ ] **Step 3: Verify and commit**

Run: `cd mobile && just check`
Expected: PASS. Then:

```bash
git add mobile/app/member/new.tsx mobile/app/_layout.tsx
git commit -m "feat(mobile): Add member — name + Core/Guest cards (#34)"
```

---

## Final verification

- [ ] `cd backend && just check` → PASS
- [ ] `cd backend && just test-integration` → PASS (needs Podman up)
- [ ] `cd mobile && just check` → PASS
- [ ] Manual smoke (optional): `just db-up && just migrate && just seed && just run` (backend), `just start` (mobile) → open The Club, tap a member, add a core and a guest.

## Notes / known gaps (by design)
- **Picks list is a placeholder** until the Phase-2 history endpoint (#39).
- **Stats fall back to `—`** for guests/inactive members (no per-member stats endpoint yet).
- **Theme tokens confirmed:** `textPresets.screenTitle`, `surface.spotlight`, `surface.card`, `shadow.spotlight`, `text.onAccent`, `radius.lg`, and `space[8]/[10]` are all verified present in `mobile/theme/` during planning — no token-name guesses remain.
