# Roster Walking Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first vertical slice — a read-only group roster — threading Postgres → Go (sqlc/pgx) → Expo, plus the foundational dev tooling.

**Architecture:** goose migrations own the schema; sqlc generates a type-safe `internal/db` package that is the only thing touching SQL; a single `GET /groups/{groupId}/members` handler in `main.go` wires the generated `*Queries` and extracts its pure pieces (UUID validation, row→DTO mapping) as standalone functions for unit tests; a one-screen Expo app fetches and renders the roster. Tests are a two-layer pyramid: pure table-driven unit tests (no DB, no doubles) and one testcontainers-go integration test against real `postgres:17`.

**Tech Stack:** Go 1.26, pgx v5 (`pgxpool`), sqlc, goose (both pinned as `go tool` deps), PostgreSQL 17 via Docker Compose, testcontainers-go, Expo (create-expo-app, TypeScript), `just` as the task runner.

**Spec:** `docs/superpowers/specs/2026-05-28-roster-slice-design.md`

**Conventions used by this plan:**
- All backend commands run from `backend/`.
- Postgres credentials: user `movie`, password `movie`, db `movienight`, port `5432`.
- `DATABASE_URL=postgres://movie:movie@localhost:5432/movienight?sslmode=disable`
- Seeded group UUID (shared by seed + integration test + mobile): `11111111-1111-1111-1111-111111111111`
- Module path: `github.com/stefanbs/movie-night-app/backend`

---

### Task 1: Dev infrastructure (Compose, `go tool` pins, justfile)

**Goal:** Stand up the reproducible dev environment — a `postgres:17` Compose service, `sqlc`/`goose` pinned as Go tool dependencies, an `.env.example`, and a self-documenting `justfile`.

**Files:**
- Create: `backend/compose.yaml`
- Create: `backend/.env.example`
- Create: `backend/justfile`
- Modify: `backend/go.mod` (via `go get -tool`, adds a `tool (...)` block)
- Modify: `backend/go.sum` (via `go get`)

**Acceptance Criteria:**
- [ ] `just db-up` starts a healthy `postgres:17` container.
- [ ] `go tool goose --version` and `go tool sqlc version` both print a version.
- [ ] `just --list` shows every recipe with its doc comment.

**Verify:** `cd backend && just db-up && go tool goose --version && go tool sqlc version && just --list` → all succeed; container reports healthy.

**Steps:**

- [ ] **Step 1: Create `backend/compose.yaml`**

```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: movie
      POSTGRES_PASSWORD: movie
      POSTGRES_DB: movienight
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U movie -d movienight"]
      interval: 2s
      timeout: 3s
      retries: 15

volumes:
  pgdata:
```

- [ ] **Step 2: Create `backend/.env.example`**

```bash
# Copy to .env (gitignored) before running just recipes.
DATABASE_URL=postgres://movie:movie@localhost:5432/movienight?sslmode=disable
```

- [ ] **Step 3: Create the local `.env`**

Run: `cd backend && cp .env.example .env`
(`.env` is already covered by the root `.gitignore`.)

- [ ] **Step 4: Pin `goose` and `sqlc` as Go tool dependencies**

Run:
```bash
cd backend
go get -tool github.com/pressly/goose/v3/cmd/goose@latest
go get -tool github.com/sqlc-dev/sqlc/cmd/sqlc@latest
```
This adds a `tool (...)` block plus pinned `require` lines to `go.mod` (exact versions land in `go.mod`/`go.sum`, which is the reproducibility we want).

- [ ] **Step 5: Create `backend/justfile`**

```makefile
set dotenv-load := true

# List all recipes
default:
    @just --list

# Start the postgres:17 container (detached)
db-up:
    docker compose up -d db

# Stop and remove the postgres container
db-down:
    docker compose down

# Destroy the postgres container and its data volume
db-reset:
    docker compose down -v

# Apply all goose migrations
migrate:
    go tool goose -dir migrations postgres "$DATABASE_URL" up

# Roll back the most recent goose migration
migrate-down:
    go tool goose -dir migrations postgres "$DATABASE_URL" down

# Load the dev seed (idempotent; NOT a migration)
seed:
    docker compose exec -T db psql -U movie -d movienight < seed.sql

# Regenerate the sqlc db package
sqlc:
    go tool sqlc generate

# Run the fast unit tests
test:
    go test ./...

# Run the testcontainers integration tests
test-integration:
    go test -tags=integration ./...

# Run the backend server
run:
    go run .
```

- [ ] **Step 6: Verify the environment**

Run: `cd backend && just db-up`
Expected: container starts. Confirm health with `docker compose ps` (STATUS shows `healthy` within ~10s).
Run: `go tool goose --version && go tool sqlc version`
Expected: each prints a version string.
Run: `just --list`
Expected: lists `db-up`, `migrate`, `seed`, `sqlc`, `test`, `run`, etc. with descriptions.

- [ ] **Step 7: Commit**

```bash
cd backend
git add compose.yaml .env.example justfile go.mod go.sum
git commit -m "chore: add compose, justfile, and pin sqlc/goose as go tools"
```

---

### Task 2: Schema migration 0001

**Goal:** A single goose migration that creates the enums and the `users`, `groups`, `memberships` tables (with indexes and FKs) — the subset of `docs/schema.dbml` this slice needs.

**Files:**
- Create: `backend/migrations/0001_init.sql`

**Acceptance Criteria:**
- [ ] `just migrate` applies cleanly against the running container.
- [ ] `just migrate-down` drops everything cleanly (reversible).
- [ ] `\d memberships` shows both indexes and the two FKs.

**Verify:** `cd backend && just db-up && just migrate` → `goose: successfully migrated`. Then `docker compose exec -T db psql -U movie -d movienight -c '\d memberships'` shows `uq_membership_group_user` and `ix_membership_active_core`.

**Steps:**

- [ ] **Step 1: Create `backend/migrations/0001_init.sql`**

```sql
-- +goose Up
-- +goose StatementBegin
CREATE TYPE membership_role AS ENUM ('core', 'guest');
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TYPE membership_status AS ENUM ('active', 'inactive');
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE users (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            varchar     NOT NULL,
    letterboxd_user varchar,
    created_at      timestamptz NOT NULL DEFAULT now()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE groups (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       varchar     NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE memberships (
    id                uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id          uuid              NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id           uuid              NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    role              membership_role   NOT NULL DEFAULT 'core',
    status            membership_status NOT NULL DEFAULT 'active',
    baseline_picks    integer           NOT NULL DEFAULT 0,
    rotation_position integer           NOT NULL,
    joined_at         timestamptz       NOT NULL DEFAULT now(),
    left_at           timestamptz
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE UNIQUE INDEX uq_membership_group_user ON memberships (group_id, user_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX ix_membership_active_core ON memberships (group_id, status, role);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS memberships;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS groups;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS users;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TYPE IF EXISTS membership_status;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TYPE IF EXISTS membership_role;
-- +goose StatementEnd
```

- [ ] **Step 2: Apply the migration**

Run: `cd backend && just db-up && just migrate`
Expected: `OK   0001_init.sql` and `goose: successfully migrated database to version: 1`.

- [ ] **Step 3: Inspect the table**

Run: `docker compose exec -T db psql -U movie -d movienight -c '\d memberships'`
Expected: columns as above; `Indexes:` lists `uq_membership_group_user` (UNIQUE) and `ix_membership_active_core`; `Foreign-key constraints:` reference `groups` and `users` with `ON DELETE CASCADE`.

- [ ] **Step 4: Verify reversibility, then re-apply**

Run: `just migrate-down && just migrate`
Expected: down drops the tables/types cleanly; up re-applies. No errors.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/0001_init.sql
git commit -m "feat: add roster schema migration (enums, users, groups, memberships)"
```

---

### Task 3: Dev seed

**Goal:** A re-runnable `seed.sql` (one group + 5 active core members with `rotation_position` 1..5) applied via `just seed`. Kept out of the migration sequence so it is unmistakably dev-only.

**Files:**
- Create: `backend/seed.sql`

**Acceptance Criteria:**
- [ ] `just seed` inserts 1 group, 5 users, 5 memberships.
- [ ] Running `just seed` twice produces no error and no duplicate rows.

**Verify:** `cd backend && just seed && just seed && docker compose exec -T db psql -U movie -d movienight -c "SELECT count(*) FROM memberships;"` → `5`.

**Steps:**

- [ ] **Step 1: Create `backend/seed.sql`**

```sql
-- Dev seed. NOT a migration. Idempotent via fixed UUIDs + ON CONFLICT DO NOTHING.
-- Group id 11111111-1111-1111-1111-111111111111 is shared by the integration
-- test and the mobile app.

INSERT INTO groups (id, name) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Friday Film Club')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, name) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Ada'),
    ('a0000000-0000-0000-0000-000000000002', 'Blake'),
    ('a0000000-0000-0000-0000-000000000003', 'Cleo'),
    ('a0000000-0000-0000-0000-000000000004', 'Dev'),
    ('a0000000-0000-0000-0000-000000000005', 'Esme')
ON CONFLICT (id) DO NOTHING;

INSERT INTO memberships (id, group_id, user_id, role, status, baseline_picks, rotation_position) VALUES
    ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'core', 'active', 0, 1),
    ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', 'core', 'active', 0, 2),
    ('b0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003', 'core', 'active', 0, 3),
    ('b0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004', 'core', 'active', 0, 4),
    ('b0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000005', 'core', 'active', 0, 5)
ON CONFLICT (group_id, user_id) DO NOTHING;
```

- [ ] **Step 2: Apply the seed twice (idempotency check)**

Run: `cd backend && just seed && just seed`
Expected: both runs succeed; second run reports `INSERT 0 0` for each statement.

- [ ] **Step 3: Confirm row counts**

Run: `docker compose exec -T db psql -U movie -d movienight -c "SELECT count(*) FROM memberships;"`
Expected: `5`.

- [ ] **Step 4: Commit**

```bash
git add backend/seed.sql
git commit -m "feat: add dev seed for one group with five core members"
```

---

### Task 4: sqlc query + codegen

**Goal:** Write the `ListGroupMembers` query and generate the type-safe `internal/db` package (mapping `uuid` columns to `github.com/google/uuid.UUID`).

**Files:**
- Create: `backend/sqlc.yaml`
- Create: `backend/internal/db/query/roster.sql`
- Create (generated): `backend/internal/db/db.go`, `backend/internal/db/models.go`, `backend/internal/db/roster.sql.go`
- Modify: `backend/go.mod`, `backend/go.sum` (via `go get`)

**Acceptance Criteria:**
- [ ] `just sqlc` generates the three files into `internal/db/`.
- [ ] Generated `ListGroupMembers` accepts a `uuid.UUID` and returns rows with `ID uuid.UUID`, `Name string`, `Role MembershipRole`.
- [ ] `go build ./...` succeeds.

**Verify:** `cd backend && just sqlc && go build ./...` → no errors; `internal/db/roster.sql.go` exists and contains `func (q *Queries) ListGroupMembers`.

**Steps:**

- [ ] **Step 1: Create `backend/sqlc.yaml`**

```yaml
version: "2"
sql:
  - engine: "postgresql"
    schema: "migrations"
    queries: "internal/db/query"
    gen:
      go:
        package: "db"
        out: "internal/db"
        sql_package: "pgx/v5"
        emit_json_tags: true
        overrides:
          - db_type: "uuid"
            go_type: "github.com/google/uuid.UUID"
```

- [ ] **Step 2: Create `backend/internal/db/query/roster.sql`**

```sql
-- name: ListGroupMembers :many
SELECT u.id, u.name, m.role
FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE m.group_id = $1
  AND m.status = 'active'
ORDER BY m.rotation_position, u.name;
```

- [ ] **Step 3: Generate the package**

Run: `cd backend && just sqlc`
Expected: creates `internal/db/db.go`, `internal/db/models.go`, `internal/db/roster.sql.go`. No errors. (sqlc reads the schema straight from the goose migration files, ignoring the `-- +goose` annotations.)

- [ ] **Step 4: Add the runtime dependencies and tidy**

Run:
```bash
go get github.com/jackc/pgx/v5
go get github.com/google/uuid
go mod tidy
```
Expected: `go.mod` now requires `pgx/v5` and `google/uuid`.

- [ ] **Step 5: Verify it builds**

Run: `go build ./...`
Expected: no errors.
Run: `grep -n "func (q \*Queries) ListGroupMembers" internal/db/roster.sql.go`
Expected: a match — the generated query method exists.

- [ ] **Step 6: Commit**

```bash
git add backend/sqlc.yaml backend/internal/db backend/go.mod backend/go.sum
git commit -m "feat: add ListGroupMembers query and generate sqlc db package"
```

---

### Task 5: Handler pure functions + unit tests (TDD)

**Goal:** Implement the handler's two pure, independently testable pieces — path UUID validation and row→DTO mapping — driven by table-driven unit tests with **no DB and no test doubles**. Write the tests first.

**Files:**
- Create: `backend/roster.go`
- Create: `backend/roster_test.go`

**Acceptance Criteria:**
- [ ] `parseGroupID` returns `(uuid.UUID, error)`: ok for a valid UUID, error for malformed/empty.
- [ ] `toMemberDTOs` maps `[]db.ListGroupMembersRow` → `[]memberDTO` preserving order, stringifying id and role.
- [ ] `toMemberDTOs(nil)` returns a non-nil empty slice (so JSON encodes as `[]`, not `null`).
- [ ] `go test ./...` passes.

**Verify:** `cd backend && go test ./...` → `ok` for the `main` package.

**Steps:**

- [ ] **Step 1: Write the failing tests in `backend/roster_test.go`**

```go
package main

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestParseGroupID(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{name: "valid uuid", input: "11111111-1111-1111-1111-111111111111", wantErr: false},
		{name: "malformed", input: "not-a-uuid", wantErr: true},
		{name: "empty", input: "", wantErr: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseGroupID(tc.input)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("parseGroupID(%q): expected error, got nil", tc.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseGroupID(%q): unexpected error: %v", tc.input, err)
			}
			if got.String() != tc.input {
				t.Fatalf("parseGroupID(%q) = %q, want round-trip equal", tc.input, got)
			}
		})
	}
}

func TestToMemberDTOs(t *testing.T) {
	id1 := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	id2 := uuid.MustParse("a0000000-0000-0000-0000-000000000002")

	tests := []struct {
		name string
		rows []db.ListGroupMembersRow
		want []memberDTO
	}{
		{
			name: "nil rows yields empty non-nil slice",
			rows: nil,
			want: []memberDTO{},
		},
		{
			name: "preserves order and stringifies fields",
			rows: []db.ListGroupMembersRow{
				{ID: id1, Name: "Ada", Role: db.MembershipRoleCore},
				{ID: id2, Name: "Blake", Role: db.MembershipRoleGuest},
			},
			want: []memberDTO{
				{ID: id1.String(), Name: "Ada", Role: "core"},
				{ID: id2.String(), Name: "Blake", Role: "guest"},
			},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := toMemberDTOs(tc.rows)
			if got == nil {
				t.Fatal("toMemberDTOs returned nil; want non-nil slice")
			}
			if len(got) != len(tc.want) {
				t.Fatalf("len = %d, want %d", len(got), len(tc.want))
			}
			for i := range tc.want {
				if got[i] != tc.want[i] {
					t.Errorf("[%d] = %+v, want %+v", i, got[i], tc.want[i])
				}
			}
		})
	}
}
```

> Note: confirm the generated enum constant names in `internal/db/models.go` (sqlc emits `MembershipRoleCore` / `MembershipRoleGuest` from the `core`/`guest` values). If they differ, update the test to match the generated names.

- [ ] **Step 2: Run the tests to confirm they fail to compile**

Run: `cd backend && go test ./...`
Expected: FAIL — `undefined: parseGroupID`, `undefined: toMemberDTOs`, `undefined: memberDTO`.

- [ ] **Step 3: Implement the pure functions in `backend/roster.go`**

```go
package main

import (
	"github.com/google/uuid"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// memberDTO is the JSON shape returned by GET /groups/{groupId}/members.
type memberDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

// parseGroupID validates a path segment as a UUID.
func parseGroupID(s string) (uuid.UUID, error) {
	return uuid.Parse(s)
}

// toMemberDTOs maps sqlc rows to JSON DTOs, preserving order. It always
// returns a non-nil slice so an empty result encodes as [] rather than null.
func toMemberDTOs(rows []db.ListGroupMembersRow) []memberDTO {
	out := make([]memberDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, memberDTO{
			ID:   r.ID.String(),
			Name: r.Name,
			Role: string(r.Role),
		})
	}
	return out
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `go test ./...`
Expected: PASS — `ok  github.com/stefanbs/movie-night-app/backend`.

- [ ] **Step 5: Commit**

```bash
git add backend/roster.go backend/roster_test.go
git commit -m "feat: add pure roster handler helpers with table-driven unit tests"
```

---

### Task 6: Wire pgxpool + handler in `main.go`

**Goal:** Open a `pgxpool` at startup from `DATABASE_URL`, register `GET /groups/{groupId}/members`, and wire the handler to the concrete sqlc `*Queries`. The handler depends on a small store interface (satisfied by `*db.Queries`) so the integration test can drive it with the real implementation — no mocks.

**Files:**
- Modify: `backend/main.go`
- Modify: `backend/roster.go` (add the handler factory + store interface)

**Acceptance Criteria:**
- [ ] `main` reads `DATABASE_URL`, opens a pool, and aborts startup with a clear log line if it cannot connect.
- [ ] `GET /groups/{groupId}/members` returns 400 on a bad UUID, 500 on a DB error (generic body, server-side log), 200 + JSON array otherwise.
- [ ] Existing `GET /healthz` still works.
- [ ] `go build ./...` and `go vet ./...` pass.

**Verify:** `cd backend && go build ./... && go vet ./...` → no errors. Manual: `just db-up && just migrate && just seed && just run`, then `curl -s localhost:8080/groups/11111111-1111-1111-1111-111111111111/members` → JSON array of 5 members in order; `curl -s -o /dev/null -w '%{http_code}' localhost:8080/groups/nope/members` → `400`.

**Steps:**

- [ ] **Step 1: Add the store interface and handler factory to `backend/roster.go`**

Append to `backend/roster.go` (and add `context`, `encoding/json`, `log`, `net/http` to its imports):

```go
// rosterStore is the slice of *db.Queries the handler needs. Declaring it as an
// interface keeps the handler wireable; the integration test passes the real
// *db.Queries, so no mock implementation is ever written.
type rosterStore interface {
	ListGroupMembers(ctx context.Context, groupID uuid.UUID) ([]db.ListGroupMembersRow, error)
}

// membersHandler serves GET /groups/{groupId}/members.
func membersHandler(store rosterStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gid, err := parseGroupID(r.PathValue("groupId"))
		if err != nil {
			http.Error(w, `{"error":"invalid group id"}`, http.StatusBadRequest)
			return
		}

		rows, err := store.ListGroupMembers(r.Context(), gid)
		if err != nil {
			log.Printf("list group members (%s): %v", gid, err)
			http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(toMemberDTOs(rows)); err != nil {
			log.Printf("encode members response (%s): %v", gid, err)
		}
	}
}
```

The full import block for `roster.go` becomes:

```go
import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)
```

- [ ] **Step 2: Rewrite `backend/main.go` to open the pool and register the route**

```go
package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("create connection pool: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("connect to database: %v", err)
	}

	queries := db.New(pool)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.Handle("GET /groups/{groupId}/members", membersHandler(queries))

	const addr = ":8080"
	log.Printf("movie-night backend listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
```

> `db.New(pool)` accepts a `pgxpool.Pool` because sqlc's generated `DBTX` interface is satisfied by both `*pgxpool.Pool` and `pgx.Conn`.

- [ ] **Step 3: Build and vet**

Run: `cd backend && go build ./... && go vet ./...`
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Run:
```bash
just db-up && just migrate && just seed
just run &   # or run in a second terminal
sleep 2
curl -s localhost:8080/groups/11111111-1111-1111-1111-111111111111/members
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/groups/nope/members
curl -s localhost:8080/groups/22222222-2222-2222-2222-222222222222/members
```
Expected: first curl → 5 members `[{"id":...,"name":"Ada","role":"core"}, ...]` in rotation order; second → `400`; third (valid UUID, no such group) → `[]`. Stop the server afterwards (`kill %1`).

- [ ] **Step 5: Commit**

```bash
git add backend/main.go backend/roster.go
git commit -m "feat: wire pgxpool and GET /groups/{groupId}/members handler"
```

---

### Task 7: Integration test (testcontainers-go)

**Goal:** One build-tagged integration test that starts real `postgres:17`, runs the goose migrations as a library, inserts known fixtures (including an inactive member and a second empty group), drives the handler through `httptest` with the real `*db.Queries`, and asserts ordering, filtering, status codes, and the empty-group case.

**Files:**
- Create: `backend/roster_integration_test.go`
- Modify: `backend/go.mod`, `backend/go.sum` (via `go get`)

**Acceptance Criteria:**
- [ ] Test is guarded by `//go:build integration` so `go test ./...` (Task 5/6) never starts a container.
- [ ] Asserts: active members returned in `rotation_position` order; inactive member excluded; bad UUID → 400; valid-but-empty group → 200 + `[]`.
- [ ] `just test-integration` passes with a container runtime available.

**Verify:** `cd backend && just test-integration` → `ok  github.com/stefanbs/movie-night-app/backend`.

**Steps:**

- [ ] **Step 1: Add the test dependencies**

Run:
```bash
cd backend
go get github.com/testcontainers/testcontainers-go@latest
go get github.com/testcontainers/testcontainers-go/modules/postgres@latest
go get github.com/pressly/goose/v3@latest
go get github.com/jackc/pgx/v5/stdlib
```
(`goose/v3` is already an indirect/tool require; this promotes it to a direct test dependency. `pgx/v5/stdlib` provides the `database/sql` driver goose needs.)

- [ ] **Step 2: Write `backend/roster_integration_test.go`**

```go
//go:build integration

package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

const (
	seededGroup = "11111111-1111-1111-1111-111111111111"
	emptyGroup  = "22222222-2222-2222-2222-222222222222"
)

// startPostgres boots postgres:17, runs the goose migrations, and returns a
// connected pool. Cleanup is registered via t.Cleanup.
func startPostgres(t *testing.T) (*pgxpool.Pool, string) {
	t.Helper()
	ctx := context.Background()

	container, err := postgres.Run(ctx, "postgres:17",
		postgres.WithDatabase("movienight"),
		postgres.WithUsername("movie"),
		postgres.WithPassword("movie"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("start postgres container: %v", err)
	}
	t.Cleanup(func() { _ = container.Terminate(ctx) })

	connStr, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}

	// Run goose migrations against the container via database/sql.
	sqlDB, err := sql.Open("pgx", connStr)
	if err != nil {
		t.Fatalf("open sql db: %v", err)
	}
	defer sqlDB.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("goose dialect: %v", err)
	}
	if err := goose.Up(sqlDB, "migrations"); err != nil {
		t.Fatalf("goose up: %v", err)
	}

	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		t.Fatalf("create pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool, connStr
}

func seedFixtures(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	stmts := []string{
		`INSERT INTO groups (id, name) VALUES
			('` + seededGroup + `', 'Friday Film Club'),
			('` + emptyGroup + `', 'Empty Crew')`,
		`INSERT INTO users (id, name) VALUES
			('a0000000-0000-0000-0000-000000000001', 'Ada'),
			('a0000000-0000-0000-0000-000000000002', 'Blake'),
			('a0000000-0000-0000-0000-000000000003', 'Cleo'),
			('a0000000-0000-0000-0000-000000000009', 'Zed')`,
		// rotation_position deliberately out of insert order to prove ORDER BY.
		// Zed is inactive and must be excluded.
		`INSERT INTO memberships (group_id, user_id, role, status, rotation_position) VALUES
			('` + seededGroup + `', 'a0000000-0000-0000-0000-000000000002', 'core', 'active', 2),
			('` + seededGroup + `', 'a0000000-0000-0000-0000-000000000001', 'core', 'active', 1),
			('` + seededGroup + `', 'a0000000-0000-0000-0000-000000000003', 'core', 'active', 3),
			('` + seededGroup + `', 'a0000000-0000-0000-0000-000000000009', 'core', 'inactive', 4)`,
	}
	for _, s := range stmts {
		if _, err := pool.Exec(ctx, s); err != nil {
			t.Fatalf("seed fixture: %v", err)
		}
	}
}

func TestMembersHandlerIntegration(t *testing.T) {
	pool, _ := startPostgres(t)
	seedFixtures(t, pool)

	handler := membersHandler(db.New(pool))
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	get := func(t *testing.T, groupID string) (*http.Response, []memberDTO) {
		t.Helper()
		// httptest server has no routing; PathValue("groupId") would be empty,
		// so exercise the registered route through a ServeMux instead.
		mux := http.NewServeMux()
		mux.Handle("GET /groups/{groupId}/members", handler)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/groups/"+groupID+"/members", nil)
		mux.ServeHTTP(rec, req)
		var got []memberDTO
		if rec.Code == http.StatusOK {
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatalf("decode body: %v", err)
			}
		}
		return rec.Result(), got
	}

	t.Run("active members in rotation order, inactive excluded", func(t *testing.T) {
		resp, got := get(t, seededGroup)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}
		wantNames := []string{"Ada", "Blake", "Cleo"}
		if len(got) != len(wantNames) {
			t.Fatalf("got %d members, want %d (%+v)", len(got), len(wantNames), got)
		}
		for i, name := range wantNames {
			if got[i].Name != name {
				t.Errorf("[%d] name = %q, want %q", i, got[i].Name, name)
			}
		}
	})

	t.Run("valid but unknown group returns empty array", func(t *testing.T) {
		resp, got := get(t, emptyGroup)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}
		if len(got) != 0 {
			t.Fatalf("got %d members, want 0", len(got))
		}
	})

	t.Run("malformed group id returns 400", func(t *testing.T) {
		resp, _ := get(t, "not-a-uuid")
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", resp.StatusCode)
		}
	})
}
```

> Note: the `srv := httptest.NewServer(handler)` line is unused once routing goes through the in-test `mux`; drop it if `go vet` flags it, or keep the handler-only server out entirely. Prefer the `mux`-based `get` helper — it is what makes `r.PathValue("groupId")` resolve.

- [ ] **Step 3: Tidy and run**

Run:
```bash
go mod tidy
just test-integration
```
Expected: container pulls/starts once, migrations apply, all three subtests PASS → `ok  github.com/stefanbs/movie-night-app/backend`.

- [ ] **Step 4: Confirm unit tests still skip the container**

Run: `go test ./...`
Expected: PASS quickly, with no container started (integration file excluded by build tag).

- [ ] **Step 5: Commit**

```bash
git add backend/roster_integration_test.go backend/go.mod backend/go.sum
git commit -m "test: add testcontainers integration test for roster endpoint"
```

---

### Task 8: Expo roster screen

**Goal:** A single-screen Expo (TypeScript) app that fetches `GET /groups/{id}/members` and renders the roster in a `FlatList` with explicit loading, error, and empty states.

**Files:**
- Create: `mobile/` (via `create-expo-app`)
- Modify: `mobile/App.tsx`
- Create: `mobile/.env` (gitignored) and `mobile/.env.example`

**Acceptance Criteria:**
- [ ] App fetches `${EXPO_PUBLIC_API_URL}/groups/<seededGroup>/members` on mount.
- [ ] Renders each member's name and role; shows a spinner while loading, an error message on failure, and an empty-state message for `[]`.
- [ ] `npx tsc --noEmit` passes in `mobile/`.

**Verify:** `cd mobile && npx tsc --noEmit` → no errors. Manual: with the backend running and seeded, `npx expo start` → open in simulator/web → roster of 5 names renders.

**Steps:**

- [ ] **Step 1: Scaffold the app**

Run (from repo root):
```bash
npx create-expo-app@latest mobile --template blank-typescript
```
Expected: `mobile/` created with `App.tsx`, `package.json`, `tsconfig.json`.

- [ ] **Step 2: Create `mobile/.env.example` and `mobile/.env`**

`mobile/.env.example`:
```bash
# Simulator / web can use localhost. A physical phone on Expo Go must use the
# dev machine's LAN IP (e.g. http://192.168.1.50:8080) — localhost is the phone.
EXPO_PUBLIC_API_URL=http://localhost:8080
```
Run: `cd mobile && cp .env.example .env`
(The root `.gitignore` already excludes `.env`.)

- [ ] **Step 3: Replace `mobile/App.tsx`**

```tsx
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";
const GROUP_ID = "11111111-1111-1111-1111-111111111111";

type Member = {
  id: string;
  name: string;
  role: "core" | "guest";
};

export default function App() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/groups/${GROUP_ID}/members`);
        if (!res.ok) {
          throw new Error(`request failed: ${res.status}`);
        }
        const data: Member[] = await res.json();
        if (!cancelled) {
          setMembers(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "failed to load roster");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Roster</Text>
      {loading ? (
        <ActivityIndicator style={styles.center} size="large" />
      ) : error ? (
        <Text style={[styles.center, styles.error]}>Couldn’t load roster: {error}</Text>
      ) : members.length === 0 ? (
        <Text style={styles.center}>No members yet.</Text>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.role}>{item.role}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48, paddingHorizontal: 16 },
  title: { fontSize: 28, fontWeight: "600", marginBottom: 16 },
  center: { marginTop: 32, textAlign: "center" },
  error: { color: "#b00020" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
  },
  name: { fontSize: 18 },
  role: { fontSize: 16, color: "#666" },
});
```

- [ ] **Step 4: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual end-to-end check**

Run (backend running + seeded from earlier tasks):
```bash
cd mobile && npx expo start
```
Open in the web build or a simulator. Expected: the title "Roster" and a list of 5 names (Ada…Esme) each with role `core`.

- [ ] **Step 6: Commit**

```bash
git add mobile
git commit -m "feat: add Expo roster screen with loading, error, and empty states"
```

---

## Self-Review

**Spec coverage:**
- Schema migration (enums + 3 tables + indexes + FKs) → Task 2 ✓
- Dev seed (1 group + 5 active core members) → Task 3 ✓
- pgxpool + sqlc `ListGroupMembers` + `GET /groups/{groupId}/members` → Tasks 4, 6 ✓
- Expo single roster screen → Task 8 ✓
- testcontainers-go integration test (migrate → seed → query → assert order, plus empty group) → Task 7 ✓
- Dev infra: compose (postgres:17), goose, sqlc config, justfile → Task 1 ✓
- API contract 200/400/500, empty array, no group-existence check → Tasks 5, 6, 7 ✓
- Pure unit tests, no doubles (UUID validation + row→DTO mapping) → Task 5 ✓
- `go tool` pinning of sqlc/goose → Task 1 ✓
- Risk: `EXPO_PUBLIC_API_URL` for LAN IP on physical phones → Task 8 .env.example note ✓
- Thread 1 (.gitignore / binary) → already committed on this branch (`491365d`), not re-done.

**Open items the implementer must confirm against generated code (flagged inline):**
- Generated sqlc enum constant names (`MembershipRoleCore`/`MembershipRoleGuest`) — Task 5 Step 1 note.
- Exact `postgres.Run` signature / wait-strategy import paths for the installed testcontainers-go version — Task 7.
