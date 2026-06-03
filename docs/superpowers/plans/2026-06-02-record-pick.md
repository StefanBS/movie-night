# Record a Pick Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the app's first write path — record who picked on a night — so the standings advance and the next `GET /turn` reflects it.

**Architecture:** A new `POST /groups/{groupId}/picks` endpoint inserts into the existing `picks` table (no migration) and returns the created pick (201). Validation is FK-only — a Postgres foreign-key violation (`23503`) maps to a clean 422. Backend mirrors `turn.go`'s structure (pure helpers + a one-method store interface, no mocks). Mobile makes the existing turn-screen rows tappable: a tap records the member for the device-local date, then refetches `/turn`.

**Tech Stack:** Go 1.26 (stdlib `net/http`, sqlc, pgx/v5, goose, testcontainers); Expo SDK 54 / React Native (TypeScript, `node:test` via `tsx`).

**Spec:** `docs/superpowers/specs/2026-06-02-record-pick-design.md`

---

### Task 1: `InsertPick` sqlc query

**Goal:** Add the insert query and regenerate the sqlc db package so `db.Queries` gains `InsertPick` + `InsertPickParams`.

**Files:**
- Create: `backend/internal/db/query/picks.sql`
- Generated (do NOT hand-edit): `backend/internal/db/picks.sql.go`

**Acceptance Criteria:**
- [ ] `just sqlc` regenerates cleanly and produces `internal/db/picks.sql.go`
- [ ] Generated `InsertPickParams` has fields `GroupID uuid.UUID`, `PickerID pgtype.UUID`, `IsCredited bool`, `ScheduledFor pgtype.Date`
- [ ] `go build ./...` succeeds

**Verify:** `cd backend && just sqlc && go build ./...` → builds clean; `git status` shows new `internal/db/query/picks.sql` and `internal/db/picks.sql.go`.

**Steps:**

- [ ] **Step 1: Create the query file**

`backend/internal/db/query/picks.sql`:

```sql
-- name: InsertPick :one
INSERT INTO picks (group_id, picker_id, is_credited, scheduled_for)
VALUES (sqlc.arg(group_id), sqlc.arg(picker_id), sqlc.arg(is_credited), sqlc.arg(scheduled_for))
RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at;
```

- [ ] **Step 2: Regenerate the db package**

Run: `cd backend && just sqlc`
Expected: no errors; `internal/db/picks.sql.go` is created with an `InsertPick(ctx, arg InsertPickParams) (Pick, error)` method.

- [ ] **Step 3: Build**

Run: `cd backend && go build ./...`
Expected: success, no output.

- [ ] **Step 4: Commit**

```bash
cd backend && git add internal/db/query/picks.sql internal/db/picks.sql.go
git commit -m "feat(backend): add InsertPick sqlc query"
```

---

### Task 2: Pure request validation + response mapping

**Goal:** Add the pure, unit-tested helpers `validatePickRequest` and `toPickResponse` (plus their DTO types) in a new `picks.go`.

**Files:**
- Create: `backend/picks.go`
- Create: `backend/picks_test.go`

**Acceptance Criteria:**
- [ ] `validatePickRequest` parses `pickerId`/`scheduledFor`, defaults `isCredited` to `true` when omitted, and errors on a bad UUID or bad date
- [ ] `toPickResponse` maps a `db.Pick` to the JSON DTO, formatting `scheduled_for` as `YYYY-MM-DD` and `created_at` as RFC3339
- [ ] Unit tests pass

**Verify:** `cd backend && go test -run '^TestValidatePickRequest$|^TestToPickResponse$' ./...` → `ok` / PASS.

**Steps:**

- [ ] **Step 1: Write the failing tests**

`backend/picks_test.go`:

```go
package main

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func boolPtr(b bool) *bool { return &b }

func TestValidatePickRequest(t *testing.T) {
	picker := "a0000000-0000-0000-0000-000000000001"

	t.Run("defaults isCredited to true when omitted", func(t *testing.T) {
		got, err := validatePickRequest(pickRequest{PickerID: picker, ScheduledFor: "2026-06-02"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.PickerID != uuid.MustParse(picker) {
			t.Errorf("PickerID = %v", got.PickerID)
		}
		if !got.IsCredited {
			t.Errorf("IsCredited = false, want true")
		}
		if !got.ScheduledFor.Valid || got.ScheduledFor.Time.Format("2006-01-02") != "2026-06-02" {
			t.Errorf("ScheduledFor = %+v", got.ScheduledFor)
		}
	})

	t.Run("preserves an explicit isCredited false", func(t *testing.T) {
		got, err := validatePickRequest(pickRequest{PickerID: picker, ScheduledFor: "2026-06-02", IsCredited: boolPtr(false)})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.IsCredited {
			t.Errorf("IsCredited = true, want false")
		}
	})

	invalid := []struct {
		name string
		req  pickRequest
	}{
		{name: "empty pickerId", req: pickRequest{PickerID: "", ScheduledFor: "2026-06-02"}},
		{name: "malformed pickerId", req: pickRequest{PickerID: "not-a-uuid", ScheduledFor: "2026-06-02"}},
		{name: "empty scheduledFor", req: pickRequest{PickerID: picker, ScheduledFor: ""}},
		{name: "malformed scheduledFor", req: pickRequest{PickerID: picker, ScheduledFor: "06/02/2026"}},
	}
	for _, tc := range invalid {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := validatePickRequest(tc.req); err == nil {
				t.Fatal("expected error, got nil")
			}
		})
	}
}

func TestToPickResponse(t *testing.T) {
	id := uuid.MustParse("c0000000-0000-0000-0000-000000000001")
	gid := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	pid := uuid.MustParse("a0000000-0000-0000-0000-000000000002")

	p := db.Pick{
		ID:           id,
		GroupID:      gid,
		PickerID:     pgtype.UUID{Bytes: pid, Valid: true},
		IsCredited:   true,
		ScheduledFor: pgtype.Date{Time: time.Date(2026, 6, 2, 0, 0, 0, 0, time.UTC), Valid: true},
		CreatedAt:    pgtype.Timestamptz{Time: time.Date(2026, 6, 2, 15, 4, 5, 0, time.UTC), Valid: true},
	}
	got := toPickResponse(p)
	want := pickResponse{
		ID:           id.String(),
		GroupID:      gid.String(),
		PickerID:     pid.String(),
		IsCredited:   true,
		ScheduledFor: "2026-06-02",
		CreatedAt:    "2026-06-02T15:04:05Z",
	}
	if got != want {
		t.Errorf("got %+v, want %+v", got, want)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test -run '^TestValidatePickRequest$|^TestToPickResponse$' ./...`
Expected: FAIL — `undefined: validatePickRequest`, `undefined: pickRequest`, etc. (does not compile).

- [ ] **Step 3: Write the implementation**

`backend/picks.go`:

```go
package main

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// pickRequest is the JSON body of POST /groups/{groupId}/picks. IsCredited is a
// pointer so an omitted field is distinguishable from an explicit false and
// defaults to true.
type pickRequest struct {
	PickerID     string `json:"pickerId"`
	ScheduledFor string `json:"scheduledFor"`
	IsCredited   *bool  `json:"isCredited"`
}

// parsedPick is a validated pickRequest with typed fields ready for the store.
type parsedPick struct {
	PickerID     uuid.UUID
	ScheduledFor pgtype.Date
	IsCredited   bool
}

// validatePickRequest validates a decoded pickRequest: pickerId must be a UUID,
// scheduledFor must be an ISO (YYYY-MM-DD) date, and isCredited defaults to true
// when omitted. Pure — no DB, no clock.
func validatePickRequest(req pickRequest) (parsedPick, error) {
	pickerID, err := uuid.Parse(req.PickerID)
	if err != nil {
		return parsedPick{}, fmt.Errorf("invalid pickerId")
	}
	t, err := time.Parse("2006-01-02", req.ScheduledFor)
	if err != nil {
		return parsedPick{}, fmt.Errorf("invalid scheduledFor")
	}
	credited := true
	if req.IsCredited != nil {
		credited = *req.IsCredited
	}
	return parsedPick{
		PickerID:     pickerID,
		ScheduledFor: pgtype.Date{Time: t, Valid: true},
		IsCredited:   credited,
	}, nil
}

// pickResponse is the JSON shape returned by POST /groups/{groupId}/picks.
type pickResponse struct {
	ID           string `json:"id"`
	GroupID      string `json:"groupId"`
	PickerID     string `json:"pickerId"`
	IsCredited   bool   `json:"isCredited"`
	ScheduledFor string `json:"scheduledFor"`
	CreatedAt    string `json:"createdAt"`
}

// toPickResponse maps an inserted pick row to its JSON DTO. picker_id is always
// set for picks created via this endpoint, so it renders as the canonical UUID
// string; scheduled_for is YYYY-MM-DD and created_at is RFC3339.
func toPickResponse(p db.Pick) pickResponse {
	return pickResponse{
		ID:           p.ID.String(),
		GroupID:      p.GroupID.String(),
		PickerID:     uuid.UUID(p.PickerID.Bytes).String(),
		IsCredited:   p.IsCredited,
		ScheduledFor: p.ScheduledFor.Time.Format("2006-01-02"),
		CreatedAt:    p.CreatedAt.Time.Format(time.RFC3339),
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test -run '^TestValidatePickRequest$|^TestToPickResponse$' ./...`
Expected: PASS / `ok`.

- [ ] **Step 5: Commit**

```bash
cd backend && git add picks.go picks_test.go
git commit -m "feat(backend): pure pick request validation and response mapping"
```

---

### Task 3: `POST /groups/{groupId}/picks` handler

**Goal:** Add the `createPickHandler` (with the one-method `pickStore` interface) and wire the route in `main.go`. FK violation → 422.

**Files:**
- Modify: `backend/picks.go` (add imports + `pickStore` + `createPickHandler`)
- Modify: `backend/main.go:48` (register the route)

**Acceptance Criteria:**
- [ ] `createPickHandler` validates the path UUID (400), decodes + validates the body (400), inserts via the store, maps `*pgconn.PgError` code `23503` to 422 and other errors to 500, and returns 201 + the created pick
- [ ] Route `POST /groups/{groupId}/picks` is registered in `main.go`
- [ ] `just check` passes (fmt, vet, build, unit tests)

**Verify:** `cd backend && just check` → all green.

**Steps:**

- [ ] **Step 1: Add the handler to `picks.go`**

Update the import block at the top of `backend/picks.go` to:

```go
import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)
```

Append to the end of `backend/picks.go`:

```go
// pickStore is the subset of *db.Queries the handler needs; the real *db.Queries
// satisfies it, so no mock is ever written (same pattern as turnStore).
type pickStore interface {
	InsertPick(ctx context.Context, arg db.InsertPickParams) (db.Pick, error)
}

// createPickHandler serves POST /groups/{groupId}/picks.
func createPickHandler(store pickStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, err := parseGroupID(r.PathValue("groupId"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid group id")
			return
		}

		var req pickRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		parsed, err := validatePickRequest(req)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}

		pick, err := store.InsertPick(r.Context(), db.InsertPickParams{
			GroupID:      gid,
			PickerID:     pgtype.UUID{Bytes: parsed.PickerID, Valid: true},
			IsCredited:   parsed.IsCredited,
			ScheduledFor: parsed.ScheduledFor,
		})
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23503" {
				writeJSONError(w, http.StatusUnprocessableEntity, "picker or group does not exist")
				return
			}
			log.Printf("insert pick (group %s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID (canonical hex), not free-form input
			writeJSONError(w, http.StatusInternalServerError, "internal server error")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		if err := json.NewEncoder(w).Encode(toPickResponse(pick)); err != nil {
			log.Printf("encode pick response (group %s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID (canonical hex), not free-form input
		}
	}
}
```

- [ ] **Step 2: Register the route in `main.go`**

In `backend/main.go`, immediately after the existing line 47
(`mux.Handle("GET /groups/{groupId}/turn", turnHandler(queries))`), add:

```go
	mux.Handle("POST /groups/{groupId}/picks", createPickHandler(queries))
```

- [ ] **Step 3: Run the gate**

Run: `cd backend && just check`
Expected: gofmt clean, `go vet` clean, build succeeds, all unit tests PASS.

- [ ] **Step 4: Commit**

```bash
cd backend && git add picks.go main.go
git commit -m "feat(backend): POST /groups/{groupId}/picks handler"
```

---

### Task 4: Backend integration test (testcontainers)

**Goal:** Prove against real Postgres that recording a pick returns 201 and advances the standings, and that the error paths return 422/400.

**Files:**
- Create: `backend/picks_integration_test.go`

**Acceptance Criteria:**
- [ ] A POST for a seeded member returns 201 with the expected body, and a follow-up `GET /turn` shows that member's `servedCount` bumped and re-ranked
- [ ] A non-existent (but well-formed) `pickerId` returns 422
- [ ] A malformed `pickerId` and malformed JSON each return 400
- [ ] `just test-integration` passes (requires the Podman runtime)

**Verify:** `cd backend && go test -tags=integration -run '^TestCreatePickHandlerIntegration$' ./...` → PASS.

**Steps:**

- [ ] **Step 1: Write the integration test**

`backend/picks_integration_test.go` (reuses `startPostgres`, `seedFixtures`, `seededGroup` from `roster_integration_test.go`):

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

func TestCreatePickHandlerIntegration(t *testing.T) {
	pool := startPostgres(t)
	seedFixtures(t, pool)

	mux := http.NewServeMux()
	mux.Handle("POST /groups/{groupId}/picks", createPickHandler(db.New(pool)))
	mux.Handle("GET /groups/{groupId}/turn", turnHandler(db.New(pool)))

	post := func(t *testing.T, groupID, body string) (int, pickResponse) {
		t.Helper()
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/groups/"+groupID+"/picks", bytes.NewBufferString(body))
		mux.ServeHTTP(rec, req)
		var got pickResponse
		if rec.Code == http.StatusCreated {
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatalf("decode body: %v", err)
			}
		}
		return rec.Code, got
	}

	getTurn := func(t *testing.T, groupID string) []turnResponse {
		t.Helper()
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/groups/"+groupID+"/turn", nil)
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("turn status = %d, want 200", rec.Code)
		}
		var got []turnResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatalf("decode turn: %v", err)
		}
		return got
	}

	const ada = "a0000000-0000-0000-0000-000000000001"

	t.Run("records a credited pick and the standings advance", func(t *testing.T) {
		// Before any pick, all active core members are served 0, so Ada
		// (rotation_position 1) leads the ranking.
		before := getTurn(t, seededGroup)
		if len(before) == 0 || before[0].Name != "Ada" {
			t.Fatalf("precondition: leader = %+v, want Ada first", before)
		}

		code, got := post(t, seededGroup, `{"pickerId":"`+ada+`","scheduledFor":"2026-06-02"}`)
		if code != http.StatusCreated {
			t.Fatalf("status = %d, want 201", code)
		}
		if got.PickerID != ada || got.ScheduledFor != "2026-06-02" || !got.IsCredited {
			t.Errorf("response = %+v", got)
		}
		if got.ID == "" || got.CreatedAt == "" {
			t.Errorf("missing id/createdAt: %+v", got)
		}

		// After: Ada is served 1, so she no longer leads and her count is 1.
		after := getTurn(t, seededGroup)
		if after[0].Name == "Ada" {
			t.Errorf("Ada still leads after picking: %+v", after)
		}
		var adaServed int32 = -1
		for _, m := range after {
			if m.Name == "Ada" {
				adaServed = m.ServedCount
			}
		}
		if adaServed != 1 {
			t.Errorf("Ada servedCount = %d, want 1", adaServed)
		}
	})

	t.Run("well-formed but unknown pickerId yields 422", func(t *testing.T) {
		code, _ := post(t, seededGroup, `{"pickerId":"a0000000-0000-0000-0000-0000000000ff","scheduledFor":"2026-06-02"}`)
		if code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want 422", code)
		}
	})

	t.Run("malformed pickerId yields 400", func(t *testing.T) {
		code, _ := post(t, seededGroup, `{"pickerId":"not-a-uuid","scheduledFor":"2026-06-02"}`)
		if code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", code)
		}
	})

	t.Run("malformed JSON yields 400", func(t *testing.T) {
		code, _ := post(t, seededGroup, `{not json`)
		if code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", code)
		}
	})
}
```

- [ ] **Step 2: Run the integration test**

Run: `cd backend && go test -tags=integration -run '^TestCreatePickHandlerIntegration$' ./...`
Expected: PASS (boots `postgres:18` via testcontainers / Podman).

- [ ] **Step 3: Commit**

```bash
cd backend && git add picks_integration_test.go
git commit -m "test(backend): integration test for recording a pick"
```

---

### Task 5: Mobile picks API client (`lib/picks.ts`)

**Goal:** Add `recordPick` (POST + 201 validation) and the pure `parsePick`, with unit and real-server integration tests, mirroring `lib/turn.ts`.

**Files:**
- Create: `mobile/lib/picks.ts`
- Create: `mobile/lib/picks.test.ts`
- Create: `mobile/lib/picks.integration.test.ts`

**Acceptance Criteria:**
- [ ] `parsePick` validates the 201 payload and throws descriptive errors on bad shapes
- [ ] `recordPick` POSTs `{pickerId, scheduledFor, isCredited?}` to `/groups/{groupId}/picks`, throws on non-2xx, and returns the parsed `Pick`
- [ ] Unit + integration tests pass

**Verify:** `cd mobile && node --import tsx --test lib/picks.test.ts lib/picks.integration.test.ts` → all tests pass.

**Steps:**

- [ ] **Step 1: Write the failing tests**

`mobile/lib/picks.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { parsePick, type Pick } from "./picks";

test("parses a valid pick", () => {
  const raw = {
    id: "c1",
    groupId: "g1",
    pickerId: "p1",
    isCredited: true,
    scheduledFor: "2026-06-02",
    createdAt: "2026-06-02T15:04:05Z",
  };
  const want: Pick = { ...raw };
  assert.deepEqual(parsePick(raw), want);
});

const invalid: { name: string; raw: unknown; wantError: RegExp }[] = [
  { name: "rejects a non-object", raw: "nope", wantError: /pick object/ },
  { name: "rejects null", raw: null, wantError: /pick object/ },
  { name: "rejects a non-string id", raw: { id: 1, groupId: "g", pickerId: "p", isCredited: true, scheduledFor: "d", createdAt: "c" }, wantError: /id/ },
  { name: "rejects a non-string pickerId", raw: { id: "c", groupId: "g", pickerId: 2, isCredited: true, scheduledFor: "d", createdAt: "c" }, wantError: /pickerId/ },
  { name: "rejects a non-boolean isCredited", raw: { id: "c", groupId: "g", pickerId: "p", isCredited: "yes", scheduledFor: "d", createdAt: "c" }, wantError: /isCredited/ },
  { name: "rejects a missing scheduledFor", raw: { id: "c", groupId: "g", pickerId: "p", isCredited: true, createdAt: "c" }, wantError: /scheduledFor/ },
];

for (const c of invalid) {
  test(c.name, () => {
    assert.throws(() => parsePick(c.raw), c.wantError);
  });
}
```

`mobile/lib/picks.integration.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { recordPick, type Pick } from "./picks";

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
const PICKER = "a0000000-0000-0000-0000-000000000001";

test("posts the pick body to the picks path and returns the created pick", async () => {
  let requestedPath = "";
  let method = "";
  let body = "";
  const created: Pick = {
    id: "c1",
    groupId: GROUP,
    pickerId: PICKER,
    isCredited: true,
    scheduledFor: "2026-06-02",
    createdAt: "2026-06-02T15:04:05Z",
  };
  const server = await startServer((req, res) => {
    requestedPath = req.url ?? "";
    method = req.method ?? "";
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      body = Buffer.concat(chunks).toString();
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(created));
    });
  });
  try {
    const pick = await recordPick(server.url, GROUP, {
      pickerId: PICKER,
      scheduledFor: "2026-06-02",
      isCredited: true,
    });
    assert.equal(method, "POST");
    assert.equal(requestedPath, `/groups/${GROUP}/picks`);
    assert.deepEqual(JSON.parse(body), {
      pickerId: PICKER,
      scheduledFor: "2026-06-02",
      isCredited: true,
    });
    assert.deepEqual(pick, created);
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
    await assert.rejects(
      recordPick(server.url, GROUP, { pickerId: PICKER, scheduledFor: "2026-06-02" }),
      /request failed: 422/,
    );
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && node --import tsx --test lib/picks.test.ts lib/picks.integration.test.ts`
Expected: FAIL — cannot resolve `./picks` / `recordPick` is not exported.

- [ ] **Step 3: Write the implementation**

`mobile/lib/picks.ts`:

```ts
export type Pick = {
  id: string;
  groupId: string;
  pickerId: string;
  isCredited: boolean;
  scheduledFor: string;
  createdAt: string;
};

// parsePick validates an untrusted JSON payload (the 201 body from the backend)
// and returns a typed Pick, throwing a descriptive error if the shape is wrong.
export function parsePick(raw: unknown): Pick {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("expected a pick object");
  }
  const { id, groupId, pickerId, isCredited, scheduledFor, createdAt } =
    raw as Record<string, unknown>;
  if (typeof id !== "string") {
    throw new Error("pick: id must be a string");
  }
  if (typeof groupId !== "string") {
    throw new Error("pick: groupId must be a string");
  }
  if (typeof pickerId !== "string") {
    throw new Error("pick: pickerId must be a string");
  }
  if (typeof isCredited !== "boolean") {
    throw new Error("pick: isCredited must be a boolean");
  }
  if (typeof scheduledFor !== "string") {
    throw new Error("pick: scheduledFor must be a string");
  }
  if (typeof createdAt !== "string") {
    throw new Error("pick: createdAt must be a string");
  }
  return { id, groupId, pickerId, isCredited, scheduledFor, createdAt };
}

export type RecordPickInput = {
  pickerId: string;
  scheduledFor: string;
  isCredited?: boolean;
};

// recordPick records a pick via POST /groups/{groupId}/picks and returns the
// created Pick. The signal lets the caller cancel an in-flight request.
export async function recordPick(
  baseUrl: string,
  groupId: string,
  input: RecordPickInput,
  signal?: AbortSignal,
): Promise<Pick> {
  const res = await fetch(`${baseUrl}/groups/${groupId}/picks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  return parsePick(await res.json());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && node --import tsx --test lib/picks.test.ts lib/picks.integration.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd mobile && git add lib/picks.ts lib/picks.test.ts lib/picks.integration.test.ts
git commit -m "feat(mobile): picks API client with record + parse"
```

---

### Task 6: Tappable rows record tonight's pick (`App.tsx` + `lib/date.ts`)

**Goal:** Make each turn-screen row tappable to record that member for the device-local date, then refetch `/turn` so the list reorders. Add the pure `todayLocalISO` helper.

**Files:**
- Create: `mobile/lib/date.ts`
- Create: `mobile/lib/date.test.ts`
- Modify: `mobile/App.tsx`

**Acceptance Criteria:**
- [ ] `todayLocalISO` returns the device-local date as `YYYY-MM-DD`, zero-padding month/day; unit-tested with an injected date
- [ ] Tapping a row calls `recordPick` (today, credited) then refetches `/turn`; taps are disabled while a record is in flight; record failure surfaces in the error state
- [ ] `just check` passes (lint, typecheck, test)

**Verify:** `cd mobile && just check` → lint, typecheck, and all tests pass. Then the manual smoke check below.

**Steps:**

- [ ] **Step 1: Write the failing test for the date helper**

`mobile/lib/date.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { todayLocalISO } from "./date";

// Dates are built from local-time components, so these assertions are
// timezone-independent.
test("formats a date as local YYYY-MM-DD", () => {
  assert.equal(todayLocalISO(new Date(2026, 5, 2, 23, 59)), "2026-06-02");
});

test("zero-pads single-digit month and day", () => {
  assert.equal(todayLocalISO(new Date(2026, 0, 5, 0, 0)), "2026-01-05");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && node --import tsx --test lib/date.test.ts`
Expected: FAIL — cannot resolve `./date`.

- [ ] **Step 3: Write the date helper**

`mobile/lib/date.ts`:

```ts
// todayLocalISO returns the given date (default: now) as a device-local
// YYYY-MM-DD string — the "tonight" a phone user means, independent of the
// server clock or UTC. The optional `now` argument keeps it pure and testable.
export function todayLocalISO(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd mobile && node --import tsx --test lib/date.test.ts`
Expected: both tests pass.

- [ ] **Step 5: Wire recording into the screen**

Replace the entire contents of `mobile/App.tsx` with:

```tsx
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";

import { resolveApiBaseUrl } from "./lib/api";
import { todayLocalISO } from "./lib/date";
import { recordPick } from "./lib/picks";
import { fetchTurn, type TurnMember } from "./lib/turn";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});
const GROUP_ID = "11111111-1111-1111-1111-111111111111";

export default function App() {
  const [turn, setTurn] = useState<TurnMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);

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
      if (recordingId !== null) {
        return;
      }
      setRecordingId(member.id);
      setError(null);
      try {
        await recordPick(API_URL, GROUP_ID, {
          pickerId: member.id,
          scheduledFor: todayLocalISO(),
          isCredited: true,
        });
        await loadTurn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to record pick");
      } finally {
        setRecordingId(null);
      }
    },
    [recordingId, loadTurn],
  );

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Whose turn?</Text>
        {loading ? (
          <ActivityIndicator style={styles.center} size="large" />
        ) : error ? (
          <Text style={[styles.center, styles.error]}>
            {`Couldn't load turn order: ${error}`}
          </Text>
        ) : turn.length === 0 ? (
          <Text style={styles.center}>No members yet.</Text>
        ) : (
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
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  title: { fontSize: 28, fontWeight: "600", marginBottom: 16 },
  center: { marginTop: 32, textAlign: "center" },
  error: { color: "#b00020" },
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

- [ ] **Step 6: Run the gate**

Run: `cd mobile && just check`
Expected: lint clean, typecheck clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
cd mobile && git add lib/date.ts lib/date.test.ts App.tsx
git commit -m "feat(mobile): tap a member to record tonight's pick"
```

---

## Final verification (after all tasks)

- [ ] **Backend full gate + integration:** `cd backend && just check && just test-integration` → all green (integration needs the Podman runtime; bring up `DOCKER_HOST` per `.env`).
- [ ] **Mobile full gate:** `cd mobile && just check` → all green.
- [ ] **Manual smoke:**
  1. `cd backend && just db-up && just migrate && just seed && just run`
  2. Record a pick:
     `curl -i -X POST localhost:8080/groups/11111111-1111-1111-1111-111111111111/picks -H 'Content-Type: application/json' -d '{"pickerId":"a0000000-0000-0000-0000-000000000001","scheduledFor":"2026-06-02"}'`
     → `201` with the created pick JSON.
  3. Unknown picker → 422:
     `curl -i -X POST localhost:8080/groups/11111111-1111-1111-1111-111111111111/picks -H 'Content-Type: application/json' -d '{"pickerId":"a0000000-0000-0000-0000-0000000000ff","scheduledFor":"2026-06-02"}'`
     → `422`.
  4. `cd mobile && just start-clean`, open the app, tap a member, confirm the row briefly shows "Recording…" and the list reorders (that member drops down with an incremented pick count).
</content>
