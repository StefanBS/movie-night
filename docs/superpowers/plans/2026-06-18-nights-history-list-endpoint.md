# Nights history list endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /groups/{groupId}/nights` returning a group's recorded nights (newest first) and wire the History tab to it via a new `listNights` client.

**Architecture:** A new stdlib handler reuses the existing `nightResponse` DTO and assembles the list from two set-based sqlc queries (recorded nights with a nullable movie LEFT JOIN; all their attendees over the night-id set) — constant queries, no N+1. The mobile side adds a `parseNights`/`listNights` pair and replaces the History screen's stub with a fetch.

**Tech Stack:** Go 1.26 stdlib `net/http` (method routing), sqlc + goose + pgx/v5, testcontainers; Expo/React Native + `node:test` via tsx.

**User decisions (already made):**
- History = recorded nights only: `picker_id IS NOT NULL` (excludes the open/planned night).
- Set-based, two queries (LEFT JOIN movies inline, attendees over the id set) — avoid N+1.
- Reactions / `loved` are #40 — no `reaction` field here.
- No pagination — return all recorded nights (single-group scale).
- Include the `history.tsx` wiring in this issue (complete the slice).

---

## File Structure

**Backend** (`backend/`):
- `internal/db/query/nights.sql` — **modify.** Add `ListRecordedNights` + `ListNightsAttendees`. Regenerate `internal/db/*` via `just sqlc` (generated, DO NOT hand-edit).
- `nights.go` — **modify.** Add the `nightStore` methods, three pure helpers (`movieDTOFromCols`, `groupAttendees`, `toNightResponses`), and `listNightsHandler`.
- `main.go` — **modify.** Register the route.
- `nights_test.go` — **modify.** Unit tests for the three pure helpers.
- `nights_integration_test.go` — **modify.** A new `TestNightsListIntegration` function.

**Mobile** (`mobile/`):
- `lib/nights.ts` — **modify.** Add `parseNights` + `listNights`.
- `lib/nights.test.ts` — **modify.** `parseNights` table-driven cases.
- `lib/nights.integration.test.ts` — **modify.** A `listNights` case over the real local server.
- `app/(tabs)/history.tsx` — **modify.** Replace the `TODO(#39)` stub with a fetch + loading/error states.

Backend tasks 1→2→3 are sequential. Mobile task 4 is contract-only and touches no backend files — it may run in parallel with the backend tasks; task 5 depends on task 4.

---

### Task 1: sqlc queries for recorded nights + their attendees

**Goal:** Add two set-based queries and regenerate the sqlc layer so the handler has typed `ListRecordedNights` / `ListNightsAttendees` methods.

**Files:**
- Modify: `backend/internal/db/query/nights.sql`
- Regenerate (do not hand-edit): `backend/internal/db/nights.sql.go`, `backend/internal/db/models.go` (via `just sqlc`)

**Acceptance Criteria:**
- [ ] `ListRecordedNights` selects picks columns + nullable movie columns via `LEFT JOIN movies`, filtered to `picker_id IS NOT NULL`, ordered newest-first.
- [ ] `ListNightsAttendees` selects `a.pick_id` plus the attendee fields for `pick_id = ANY($night_ids)`.
- [ ] `just sqlc` regenerates cleanly; `go build ./...` passes.
- [ ] The generated `ListRecordedNightsRow` types the joined movie columns as nullable (`pgtype.Int4`/`pgtype.Text`).

**Verify:** `cd backend && just sqlc && go build ./...` → no errors; `grep -n "MovieTmdbID pgtype.Int4" internal/db/nights.sql.go` → found.

**Steps:**

- [ ] **Step 1: Append the two queries to `nights.sql`**

Append to `backend/internal/db/query/nights.sql`:

```sql
-- name: ListRecordedNights :many
SELECT
  p.id, p.group_id, p.picker_id, p.is_credited, p.scheduled_for, p.created_at, p.movie_id,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path
FROM picks p
LEFT JOIN movies m ON m.id = p.movie_id
WHERE p.group_id = sqlc.arg(group_id) AND p.picker_id IS NOT NULL
ORDER BY p.scheduled_for DESC, p.created_at DESC;

-- name: ListNightsAttendees :many
SELECT a.pick_id, u.id, u.name, m.role
FROM attendances a
JOIN users u ON u.id = a.user_id
JOIN memberships m ON m.user_id = a.user_id AND m.group_id = sqlc.arg(group_id)
WHERE a.pick_id = ANY(sqlc.arg(night_ids)::uuid[])
ORDER BY
  CASE WHEN m.role = 'core' THEN 0 ELSE 1 END,
  u.name;
```

- [ ] **Step 2: Regenerate and build**

Run: `cd backend && just sqlc && go build ./...`
Expected: regenerates `internal/db/nights.sql.go` + `models.go`; build passes.

- [ ] **Step 3: Confirm nullable movie columns**

Run: `grep -nE "MovieTmdbID|MovieTitle|MovieReleaseYear|MoviePosterPath" backend/internal/db/nights.sql.go`
Expected: `MovieTmdbID pgtype.Int4`, `MovieTitle pgtype.Text`, `MovieReleaseYear pgtype.Int4`, `MoviePosterPath pgtype.Text` (sqlc's PostgreSQL engine marks LEFT-JOINed columns nullable). If these came out non-nullable (`int32`/`string`), that's a sqlc nullability gap — STOP and report; the Task 2 helper relies on `.Valid`.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/db/query/nights.sql backend/internal/db
git commit -m "feat(backend): sqlc queries for recorded nights + attendees (#39)"
```

---

### Task 2: List handler, pure helpers, route + unit tests

**Goal:** Add `listNightsHandler` and its three pure helpers, register the route, and unit-test the assembly logic.

**Files:**
- Modify: `backend/nights.go`
- Modify: `backend/main.go`
- Test: `backend/nights_test.go`

**Acceptance Criteria:**
- [ ] `nightStore` gains `ListRecordedNights` + `ListNightsAttendees`.
- [ ] `movieDTOFromCols`, `groupAttendees`, `toNightResponses` are pure and unit-tested (movie present/absent; attendees grouped per night; empty attendees encode `[]`; order preserved).
- [ ] `listNightsHandler` issues exactly two store calls (one nights, one attendees), and skips the attendees call when there are no nights.
- [ ] Route `GET /groups/{groupId}/nights` registered in `main.go`.
- [ ] `cd backend && just check` passes.

**Verify:** `cd backend && just check` → gofmt + vet + build + unit tests pass; `go test -run '^TestToNightResponses$|^TestGroupAttendees$|^TestMovieDTOFromCols$' ./...` → PASS.

**Steps:**

- [ ] **Step 1: Add the two methods to the `nightStore` interface**

In `backend/nights.go`, inside the `nightStore interface` block (after `ListNightAttendees`), add:

```go
	ListRecordedNights(ctx context.Context, groupID uuid.UUID) ([]db.ListRecordedNightsRow, error)
	ListNightsAttendees(ctx context.Context, arg db.ListNightsAttendeesParams) ([]db.ListNightsAttendeesRow, error)
```

- [ ] **Step 2: Add the three pure helpers**

In `backend/nights.go` (near `toNightResponse`), add:

```go
// movieDTOFromCols builds the movie DTO from the nullable LEFT JOIN columns of a
// ListRecordedNights row; nil when the night has no movie attached.
func movieDTOFromCols(row db.ListRecordedNightsRow) *movieDTO {
	if !row.MovieTmdbID.Valid {
		return nil
	}
	return &movieDTO{
		TMDBID:      row.MovieTmdbID.Int32,
		Title:       row.MovieTitle.String,
		ReleaseYear: releaseYearPtr(row.MovieReleaseYear),
		PosterURL:   posterURLPtr(row.MoviePosterPath),
	}
}

// groupAttendees buckets attendee rows by their night (pick_id), preserving the
// query's role-then-name order within each night.
func groupAttendees(rows []db.ListNightsAttendeesRow) map[uuid.UUID][]attendee {
	byNight := make(map[uuid.UUID][]attendee)
	for _, r := range rows {
		byNight[r.PickID] = append(byNight[r.PickID], attendee{
			ID:   r.ID.String(),
			Name: r.Name,
			Role: string(r.Role),
		})
	}
	return byNight
}

// toNightResponses assembles the ordered history list from recorded-night rows
// and the attendees grouped by night. Attendees default to a non-nil empty slice
// so a night with none encodes as [] rather than null.
func toNightResponses(rows []db.ListRecordedNightsRow, byNight map[uuid.UUID][]attendee) []nightResponse {
	out := make([]nightResponse, 0, len(rows))
	for _, row := range rows {
		atts := byNight[row.ID]
		if atts == nil {
			atts = []attendee{}
		}
		out = append(out, nightResponse{
			ID:           row.ID.String(),
			ScheduledFor: row.ScheduledFor.Time.Format("2006-01-02"),
			PickerID:     pickerIDPtr(row.PickerID),
			Movie:        movieDTOFromCols(row),
			Attendees:    atts,
		})
	}
	return out
}
```

- [ ] **Step 3: Add the handler**

In `backend/nights.go`, add:

```go
// listNightsHandler serves GET /groups/{groupId}/nights — the group's recorded
// nights (picker set), newest first. Two set-based queries (the nights, then all
// of their attendees in one shot) keep it constant in the number of nights.
func listNightsHandler(store nightStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, ok := pathUUID(w, r, "groupId", "invalid group id")
		if !ok {
			return
		}
		ctx := r.Context()
		rows, err := store.ListRecordedNights(ctx, gid)
		if err != nil {
			internalError(w, gid, "list recorded nights", err)
			return
		}
		ids := make([]uuid.UUID, 0, len(rows))
		for _, row := range rows {
			ids = append(ids, row.ID)
		}
		byNight := map[uuid.UUID][]attendee{}
		if len(ids) > 0 {
			attRows, err := store.ListNightsAttendees(ctx, db.ListNightsAttendeesParams{GroupID: gid, NightIDs: ids})
			if err != nil {
				internalError(w, gid, "list nights attendees", err)
				return
			}
			byNight = groupAttendees(attRows)
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(toNightResponses(rows, byNight)); err != nil {
			log.Printf("encode nights list response (%s): %v", gid, err) //#nosec G706 -- gid is a parsed uuid.UUID (canonical hex), not free-form input
		}
	}
}
```

- [ ] **Step 4: Register the route**

In `backend/main.go`, after the `POST /groups/{groupId}/nights` line (line ~59), add:

```go
	mux.Handle("GET /groups/{groupId}/nights", listNightsHandler(queries))
```

- [ ] **Step 5: Write the unit tests**

Append to `backend/nights_test.go` (the file already imports `testing`, `time`, `uuid`, `pgtype`, `db`):

```go
func TestMovieDTOFromCols(t *testing.T) {
	base := db.ListRecordedNightsRow{
		ID:           uuid.MustParse("b0000000-0000-0000-0000-0000000000aa"),
		ScheduledFor: pgtype.Date{Time: mustDate(t, "2026-05-01"), Valid: true},
	}

	t.Run("nil when no movie", func(t *testing.T) {
		if got := movieDTOFromCols(base); got != nil {
			t.Fatalf("want nil, got %+v", got)
		}
	})

	t.Run("maps the nullable columns", func(t *testing.T) {
		row := base
		row.MovieTmdbID = pgtype.Int4{Int32: 27205, Valid: true}
		row.MovieTitle = pgtype.Text{String: "Inception", Valid: true}
		row.MovieReleaseYear = pgtype.Int4{Int32: 2010, Valid: true}
		row.MoviePosterPath = pgtype.Text{String: "/inc.jpg", Valid: true}
		got := movieDTOFromCols(row)
		if got == nil || got.TMDBID != 27205 || got.Title != "Inception" {
			t.Fatalf("unexpected movie dto: %+v", got)
		}
		if got.ReleaseYear == nil || *got.ReleaseYear != 2010 {
			t.Fatalf("want release year 2010, got %v", got.ReleaseYear)
		}
		if got.PosterURL == nil {
			t.Fatalf("want a poster url, got nil")
		}
	})
}

func TestGroupAttendees(t *testing.T) {
	n1 := uuid.MustParse("b0000000-0000-0000-0000-0000000000aa")
	n2 := uuid.MustParse("b0000000-0000-0000-0000-0000000000bb")
	ada := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	blake := uuid.MustParse("a0000000-0000-0000-0000-000000000002")
	rows := []db.ListNightsAttendeesRow{
		{PickID: n1, ID: ada, Name: "Ada", Role: db.MembershipRoleCore},
		{PickID: n1, ID: blake, Name: "Blake", Role: db.MembershipRoleCore},
		{PickID: n2, ID: ada, Name: "Ada", Role: db.MembershipRoleCore},
	}
	got := groupAttendees(rows)
	if len(got[n1]) != 2 || len(got[n2]) != 1 {
		t.Fatalf("want 2 + 1 attendees, got %d + %d", len(got[n1]), len(got[n2]))
	}
	if got[n1][0].Name != "Ada" || got[n1][1].Name != "Blake" {
		t.Fatalf("attendee order not preserved: %+v", got[n1])
	}
}

func TestToNightResponses(t *testing.T) {
	n1 := uuid.MustParse("b0000000-0000-0000-0000-0000000000aa") // newest, has movie + attendees
	n2 := uuid.MustParse("b0000000-0000-0000-0000-0000000000bb") // older, no movie, no attendees
	ada := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	rows := []db.ListRecordedNightsRow{
		{
			ID:           n1,
			PickerID:     pgtype.UUID{Bytes: ada, Valid: true},
			ScheduledFor: pgtype.Date{Time: mustDate(t, "2026-06-01"), Valid: true},
			MovieTmdbID:  pgtype.Int4{Int32: 27205, Valid: true},
			MovieTitle:   pgtype.Text{String: "Inception", Valid: true},
		},
		{
			ID:           n2,
			PickerID:     pgtype.UUID{Bytes: ada, Valid: true},
			ScheduledFor: pgtype.Date{Time: mustDate(t, "2026-05-01"), Valid: true},
		},
	}
	byNight := map[uuid.UUID][]attendee{
		n1: {{ID: ada.String(), Name: "Ada", Role: "core"}},
	}
	got := toNightResponses(rows, byNight)
	if len(got) != 2 {
		t.Fatalf("want 2 nights, got %d", len(got))
	}
	if got[0].ID != n1.String() || got[1].ID != n2.String() {
		t.Fatalf("order not preserved: %s then %s", got[0].ID, got[1].ID)
	}
	if got[0].ScheduledFor != "2026-06-01" {
		t.Fatalf("want scheduledFor 2026-06-01, got %s", got[0].ScheduledFor)
	}
	if got[0].Movie == nil || got[0].Movie.Title != "Inception" {
		t.Fatalf("want movie Inception, got %+v", got[0].Movie)
	}
	if got[1].Movie != nil {
		t.Fatalf("want nil movie on second night, got %+v", got[1].Movie)
	}
	if got[1].Attendees == nil || len(got[1].Attendees) != 0 {
		t.Fatalf("want empty (non-nil) attendees, got %+v", got[1].Attendees)
	}
}
```

- [ ] **Step 6: Run the gate**

Run: `cd backend && just check`
Expected: gofmt + vet + build + unit tests all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/nights.go backend/main.go backend/nights_test.go
git commit -m "feat(backend): GET /groups/{groupId}/nights recorded-nights list (#39)"
```

---

### Task 3: Integration test (testcontainers)

**Goal:** Prove the endpoint returns recorded nights newest-first, excludes the open night, and carries movie + attendees, against real Postgres.

**Files:**
- Modify: `backend/nights_integration_test.go`

**Acceptance Criteria:**
- [ ] A new `TestNightsListIntegration` seeds two recorded nights (one with a movie + two attendees, one without a movie) and one open night, then `GET /groups/{groupId}/nights`.
- [ ] Asserts: 200; two elements; newest-first order; the open night absent; movie + attendees correct on the movie night; empty group → `[]`.
- [ ] `cd backend && just test-integration` passes.

**Verify:** `cd backend && just test-integration` → PASS (includes the new test); or `go test -tags=integration -run '^TestNightsListIntegration$' ./...` → PASS.

**Steps:**

- [ ] **Step 1: Add the test function**

Append to `backend/nights_integration_test.go` (it already has the `//go:build integration` tag and imports `bytes`, `context`, `encoding/json`, `net/http`, `net/http/httptest`, `testing`, `db`). Add the constant `emptyGroup` if not already imported — it is declared in `roster_integration_test.go` (same package), as is `seededGroup` and `seedFixtures`.

```go
func TestNightsListIntegration(t *testing.T) {
	pool := startPostgres(t)
	seedFixtures(t, pool)

	mux := http.NewServeMux()
	q := db.New(pool)
	mux.Handle("GET /groups/{groupId}/nights", listNightsHandler(q))

	const (
		ada     = "a0000000-0000-0000-0000-000000000001"
		blake   = "a0000000-0000-0000-0000-000000000002"
		night1  = "b0000000-0000-0000-0000-0000000000a1" // older, has movie + attendees
		night2  = "b0000000-0000-0000-0000-0000000000a2" // newer, no movie
		openOne = "b0000000-0000-0000-0000-0000000000a3" // open (picker NULL) — must be excluded
		movieID = "c0000000-0000-0000-0000-0000000000m1"
	)

	ctx := context.Background()
	seed := []struct {
		sql  string
		args []any
	}{
		{sql: `INSERT INTO movies (id, tmdb_id, title, release_year, poster_path)
		        VALUES ($1, 27205, 'Inception', 2010, '/inc.jpg')`, args: []any{movieID}},
		{sql: `INSERT INTO picks (id, group_id, picker_id, is_credited, scheduled_for, movie_id)
		        VALUES ($1, $2, $3, true, '2026-05-01', $4)`, args: []any{night1, seededGroup, ada, movieID}},
		{sql: `INSERT INTO picks (id, group_id, picker_id, is_credited, scheduled_for)
		        VALUES ($1, $2, $3, true, '2026-06-01')`, args: []any{night2, seededGroup, blake}},
		{sql: `INSERT INTO picks (id, group_id, scheduled_for)
		        VALUES ($1, $2, '2026-07-01')`, args: []any{openOne, seededGroup}},
		{sql: `INSERT INTO attendances (pick_id, user_id) VALUES ($1, $2), ($1, $3)`, args: []any{night1, ada, blake}},
	}
	for _, s := range seed {
		if _, err := pool.Exec(ctx, s.sql, s.args...); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	do := func(t *testing.T, path string) (int, []byte) {
		t.Helper()
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		return rec.Code, rec.Body.Bytes()
	}

	t.Run("lists recorded nights newest-first, excludes the open night", func(t *testing.T) {
		code, b := do(t, "/groups/"+seededGroup+"/nights")
		if code != http.StatusOK {
			t.Fatalf("want 200, got %d: %s", code, b)
		}
		var got []nightResponse
		if err := json.Unmarshal(b, &got); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if len(got) != 2 {
			t.Fatalf("want 2 recorded nights, got %d: %s", len(got), b)
		}
		// newest scheduled_for first: night2 (2026-06-01) then night1 (2026-05-01).
		if got[0].ID != night2 || got[1].ID != night1 {
			t.Fatalf("order wrong: %s then %s", got[0].ID, got[1].ID)
		}
		if got[0].Movie != nil {
			t.Fatalf("night2 should have no movie, got %+v", got[0].Movie)
		}
		if got[1].Movie == nil || got[1].Movie.Title != "Inception" {
			t.Fatalf("night1 movie wrong: %+v", got[1].Movie)
		}
		if len(got[1].Attendees) != 2 {
			t.Fatalf("night1 want 2 attendees, got %d", len(got[1].Attendees))
		}
	})

	t.Run("empty group returns []", func(t *testing.T) {
		code, b := do(t, "/groups/"+emptyGroup+"/nights")
		if code != http.StatusOK {
			t.Fatalf("want 200, got %d: %s", code, b)
		}
		var got []nightResponse
		if err := json.Unmarshal(b, &got); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if len(got) != 0 {
			t.Fatalf("want empty list, got %d", len(got))
		}
	})
}
```

- [ ] **Step 2: Run the integration suite**

Run: `cd backend && go test -tags=integration -run '^TestNightsListIntegration$' ./...`
Expected: PASS (needs a container runtime — Podman via `DOCKER_HOST`).

- [ ] **Step 3: Commit**

```bash
git add backend/nights_integration_test.go
git commit -m "test(backend): integration test for recorded-nights list (#39)"
```

---

### Task 4: Mobile `listNights` client + parser + tests

**Goal:** Add the typed `listNights` client and `parseNights` validator with tests.

**Files:**
- Modify: `mobile/lib/nights.ts`
- Test: `mobile/lib/nights.test.ts`
- Test: `mobile/lib/nights.integration.test.ts`

**Acceptance Criteria:**
- [ ] `parseNights(raw): Night[]` asserts an array and maps the existing `parseNight`.
- [ ] `listNights(baseUrl, groupId, signal?): Promise<Night[]>` GETs `/groups/{groupId}/nights`.
- [ ] Unit tests cover a valid array, `[]`, a non-array (throws), and a malformed element (throws).
- [ ] An integration case hits a real local server and parses the array.
- [ ] `cd mobile && just check` passes.

**Verify:** `cd mobile && just check`; `node --import tsx --test lib/nights.test.ts` → PASS.

**Steps:**

- [ ] **Step 1: Add the client + parser**

In `mobile/lib/nights.ts`, after `parseNight` (and before `fetchNight`), add `parseNights`; and after `getCurrentNight`, add `listNights`:

```ts
// parseNights validates an untrusted JSON array and returns typed Nights,
// throwing a descriptive error if the payload or any element is malformed.
export function parseNights(raw: unknown): Night[] {
  if (!Array.isArray(raw)) {
    throw new Error("expected an array of nights");
  }
  return raw.map(parseNight);
}
```

```ts
// listNights loads the group's recorded nights (picker set), newest first.
export function listNights(
  baseUrl: string,
  groupId: string,
  signal?: AbortSignal,
): Promise<Night[]> {
  return requestJson(`${baseUrl}/groups/${groupId}/nights`, parseNights, { signal });
}
```

(`requestJson` is already imported at the top of the file.)

- [ ] **Step 2: Add unit tests**

Append to `mobile/lib/nights.test.ts` (it already imports `test`, `assert`; add `parseNights` to the import from `./nights`):

```ts
test("parseNights parses an array of nights", () => {
  const ns = parseNights([valid, { id: "n2", scheduledFor: "2026-07-01", attendees: [] }]);
  assert.equal(ns.length, 2);
  assert.equal(ns[0].id, "n1");
  assert.equal(ns[1].id, "n2");
});

test("parseNights accepts an empty array", () => {
  assert.deepEqual(parseNights([]), []);
});

test("parseNights rejects a non-array", () => {
  assert.throws(() => parseNights({}), /array of nights/);
});

test("parseNights rejects a malformed element", () => {
  assert.throws(() => parseNights([valid, { id: 5 }]), /id/);
});
```

Update the import line at the top of the file from `import { parseNight } from "./nights";` to:

```ts
import { parseNight, parseNights } from "./nights";
```

- [ ] **Step 3: Add the integration case**

Append to `mobile/lib/nights.integration.test.ts` (add `listNights` to the import from `./nights`):

```ts
test("listNights GETs the group's nights and parses the array", async () => {
  let path = "";
  const server = await startServer((req, res) => {
    path = req.url ?? "";
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify([night, { ...night, id: "n2", scheduledFor: "2026-07-01" }]));
  });
  try {
    const got = await listNights(server.url, GROUP);
    assert.equal(path, `/groups/${GROUP}/nights`);
    assert.equal(got.length, 2);
    assert.equal(got[0].id, "n1");
    assert.equal(got[1].id, "n2");
  } finally {
    await server.close();
  }
});
```

Update the import in that file to include `listNights` alongside the other client imports.

- [ ] **Step 4: Run the gate**

Run: `cd mobile && just check`
Expected: lint + typecheck + tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/nights.ts mobile/lib/nights.test.ts mobile/lib/nights.integration.test.ts
git commit -m "feat(mobile): listNights client + parseNights validator (#39)"
```

---

### Task 5: Wire the History screen to `listNights`

**Goal:** Replace the History tab's `TODO(#39)` stub with a real fetch, adding loading and error states.

**Files:**
- Modify: `mobile/app/(tabs)/history.tsx`

**Acceptance Criteria:**
- [ ] The screen fetches via `listNights` in a `useEffect` (with `AbortController`), holding `nights`/`loading`/`error` state.
- [ ] Loading → `ActivityIndicator`; error → danger text; empty → existing "No nights yet" state; loaded → existing stat strip + month list (unchanged).
- [ ] The `TODO(#39)` comment is removed; no change to `lib/history.ts`.
- [ ] `cd mobile && just check` passes.

**Verify:** `cd mobile && just check`. Manual: with the backend running and a recorded night seeded, open the History tab → the night appears under its month with the stat strip.

**Steps:**

- [ ] **Step 1: Replace the component with a fetching version**

In `mobile/app/(tabs)/history.tsx`, replace the imports block and the `HistoryScreen` component (keep the `firstNameOf` helper and the `styles` block unchanged) with:

```tsx
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

import { Poster, SectionLabel, Stat, TopBar } from "../../components";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { formatShortDate } from "../../lib/date";
import { errorMessage } from "../../lib/errors";
import { buildHistoryMonths, historyStats } from "../../lib/history";
import { listNights, type Night } from "../../lib/nights";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  pressedOpacity,
  radius,
  space,
  textPresets,
} from "../../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

function firstNameOf(name: string): string {
  return name.split(" ")[0];
}

export default function HistoryScreen() {
  const router = useRouter();
  const [nights, setNights] = useState<Night[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setNights(await listNights(API_URL, GROUP_ID, controller.signal));
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(errorMessage(e, "failed to load history"));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <View style={styles.screen}>
        <TopBar kind="tab" title="History" />
        <ActivityIndicator
          style={styles.center}
          size="large"
          color={colors.accent.base}
        />
      </View>
    );
  }

  if (error !== null) {
    return (
      <View style={styles.screen}>
        <TopBar kind="tab" title="History" />
        <View style={styles.body}>
          <Text style={styles.errorText}>{`Couldn't load history: ${error}`}</Text>
        </View>
      </View>
    );
  }

  if (nights.length === 0) {
    return (
      <View style={styles.screen}>
        <TopBar kind="tab" title="History" />
        <View style={styles.body}>
          <Text style={styles.empty}>No nights yet — start one.</Text>
        </View>
      </View>
    );
  }

  const stats = historyStats(nights);
  const months = buildHistoryMonths(nights);
  const open = (id: string) =>
    router.push({ pathname: "/night/[id]", params: { id } });

  return (
    <View style={styles.screen}>
      <TopBar kind="tab" title="History" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.stats}>
          <View style={styles.statCell}>
            <Stat value={stats.nights} label="Nights" />
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Stat value={stats.films} label="Films" />
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Stat value={stats.loved} label="Loved" accent />
          </View>
        </View>

        {months.map((month) => (
          <View key={month.label}>
            <SectionLabel>{month.label}</SectionLabel>
            {month.nights.map((n, i) => {
              const picker =
                n.attendees.find((a) => a.id === n.pickerId) ?? null;
              return (
                <Pressable
                  key={n.id}
                  onPress={() => open(n.id)}
                  style={({ pressed }) => [
                    styles.row,
                    i < month.nights.length - 1 && styles.divider,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Poster
                    uri={n.movie?.posterUrl}
                    title={n.movie?.title}
                    w={46}
                    h={69}
                  />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {n.movie ? n.movie.title : "Untitled night"}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {picker !== null ? `${firstNameOf(picker.name)} · ` : ""}
                      {formatShortDate(n.scheduledFor)}
                    </Text>
                  </View>
                  {/* TODO(#40): reaction glyph renders here when present */}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 2: Add the two new style keys**

In the `styles` `StyleSheet.create({...})` block in the same file, add (next to `center`/`empty`):

```tsx
  center: { marginTop: space[8], alignSelf: "center" },
  errorText: { ...textPresets.body, color: colors.text.danger },
```

(`center` mirrors Tonight's spinner placement; `errorText` mirrors its error text — `colors.text.danger` is the same token `index.tsx` uses.)

- [ ] **Step 3: Run the gate**

Run: `cd mobile && just check`
Expected: lint + typecheck + tests pass.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/\(tabs\)/history.tsx
git commit -m "feat(mobile): wire History tab to the nights-list endpoint (#39)"
```

---

## Self-Review

**Spec coverage:**
- Contract (array of `nightResponse`, recorded-only, newest-first, `[]` empty, 400 invalid) → Task 1 (query filter/order) + Task 2 (handler, `pathUUID` 400) + Task 3 (asserts order/exclusion/empty). ✓
- Two set-based queries, no N+1 → Task 1 (queries) + Task 2 (handler issues exactly two calls). ✓
- `nightStore` + route additions → Task 2. ✓
- Pure helpers `groupAttendees`/`movieDTOFromCols`/`toNightResponses` + unit tests → Task 2. ✓
- Integration test (testcontainers) → Task 3. ✓
- Mobile `parseNights` + `listNights` + tests → Task 4. ✓
- History wiring (loading/error/empty/loaded) → Task 5. ✓
- No reactions / no pagination → not implemented (out of scope, honored). ✓

**Placeholder scan:** No TBD/"add error handling"/"similar to" — full code inline in every code step. The only `TODO` strings are the *existing* `TODO(#40)` comment (intentionally retained) and removal of `TODO(#39)`. ✓

**Type consistency:** `db.ListRecordedNightsRow` fields (`MovieTmdbID pgtype.Int4`, `MovieTitle pgtype.Text`, `MovieReleaseYear pgtype.Int4`, `MoviePosterPath pgtype.Text`, `PickerID pgtype.UUID`, `ScheduledFor pgtype.Date`) defined in Task 1, used consistently in Task 2 helpers/tests. `db.ListNightsAttendeesParams{GroupID, NightIDs}` and `db.ListNightsAttendeesRow{PickID, ID, Name, Role}` consistent across Task 2 handler + tests and Task 3. `parseNights`/`listNights` signatures match between Task 4 definition and Task 5 usage. Helper names don't collide with existing `toNightResponse`/`toTurnResponses`. ✓
