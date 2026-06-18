//go:build integration

package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// This file holds the integration-test harness shared by every *_integration_test.go:
// the single Postgres container, the seed fixtures, and the HTTP request helpers.
// Keeping it in one place means a test file only declares what is specific to it.

const (
	seededGroup = "11111111-1111-1111-1111-111111111111"
	emptyGroup  = "22222222-2222-2222-2222-222222222222"
)

// testPool is the connection pool to the one Postgres container shared by all
// integration tests. It is brought up once in TestMain and reset per test by
// freshDB. The tests run sequentially (none call t.Parallel), so a single shared
// database is safe — and far cheaper than booting a container per test.
var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	os.Exit(runIntegrationTests(m))
}

// runIntegrationTests boots the shared container, migrates it, and runs the
// suite. It is split from TestMain so its defers (terminate, pool close) run
// before os.Exit, which would otherwise skip them.
func runIntegrationTests(m *testing.M) int {
	ctx := context.Background()

	container, err := postgres.Run(ctx, "postgres:18",
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
		log.Printf("start postgres container: %v", err)
		return 1
	}
	defer func() { _ = container.Terminate(ctx) }()

	connStr, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		log.Printf("connection string: %v", err)
		return 1
	}
	if err := migrate(connStr); err != nil {
		log.Printf("%v", err)
		return 1
	}

	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		log.Printf("create pool: %v", err)
		return 1
	}
	defer pool.Close()
	testPool = pool

	return m.Run()
}

// migrate runs the goose migrations against the container over a throwaway
// database/sql handle (goose drives migrations through database/sql, not pgx).
func migrate(connStr string) error {
	sqlDB, err := sql.Open("pgx", connStr)
	if err != nil {
		return fmt.Errorf("open sql db: %w", err)
	}
	defer sqlDB.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("goose dialect: %w", err)
	}
	if err := goose.Up(sqlDB, "migrations"); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	return nil
}

// freshDB truncates every table and returns the shared pool, so each test starts
// from an empty schema. Tests run sequentially, so the shared database is safe;
// CASCADE drops the FK-dependent rows (memberships, attendances, picks) too.
func freshDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if _, err := testPool.Exec(context.Background(),
		`TRUNCATE groups, users, memberships, picks, attendances, movies CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return testPool
}

// seedStmt is a parameterized fixture insert. Grouping the SQL with its args lets
// execSeed run a batch in order and report the first failure.
type seedStmt struct {
	sql  string
	args []any
}

// execSeed runs fixture statements in order, failing the test on the first error.
func execSeed(t *testing.T, pool *pgxpool.Pool, stmts []seedStmt) {
	t.Helper()
	ctx := context.Background()
	for _, s := range stmts {
		if _, err := pool.Exec(ctx, s.sql, s.args...); err != nil {
			t.Fatalf("seed fixture: %v", err)
		}
	}
}

// seedFixtures inserts the baseline two groups, five users, and their memberships
// shared by most integration tests. Run it after freshDB.
func seedFixtures(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	execSeed(t, pool, []seedStmt{
		{
			sql: `INSERT INTO groups (id, name) VALUES
				($1, 'Friday Film Club'),
				($2, 'Empty Crew')`,
			args: []any{seededGroup, emptyGroup},
		},
		{
			sql: `INSERT INTO users (id, name) VALUES
				('a0000000-0000-0000-0000-000000000001', 'Ada'),
				('a0000000-0000-0000-0000-000000000002', 'Blake'),
				('a0000000-0000-0000-0000-000000000003', 'Cleo'),
				('a0000000-0000-0000-0000-000000000006', 'Frankie'),
				('a0000000-0000-0000-0000-000000000009', 'Zed')`,
		},
		{
			// rotation_position deliberately out of insert order to prove ORDER BY.
			// Zed is inactive; Frankie is an active guest (not in the rotation).
			sql: `INSERT INTO memberships (group_id, user_id, role, status, rotation_position) VALUES
				($1, 'a0000000-0000-0000-0000-000000000002', 'core', 'active', 2),
				($1, 'a0000000-0000-0000-0000-000000000001', 'core', 'active', 1),
				($1, 'a0000000-0000-0000-0000-000000000003', 'core', 'active', 3),
				($1, 'a0000000-0000-0000-0000-000000000009', 'core', 'inactive', 4),
				($1, 'a0000000-0000-0000-0000-000000000006', 'guest', 'active', 5)`,
			args: []any{seededGroup},
		},
	})
}

// clearOpenNight deletes a group's open night (picker_id NULL) so the next
// create starts fresh instead of resuming it (at most one open night per group,
// uq_open_night_per_group). The FK cascade drops its attendances.
func clearOpenNight(t *testing.T, pool *pgxpool.Pool, group string) {
	t.Helper()
	if _, err := pool.Exec(context.Background(),
		"DELETE FROM picks WHERE group_id = $1 AND picker_id IS NULL", group); err != nil {
		t.Fatalf("clear open night: %v", err)
	}
}

// clearAllPicks removes every pick (open and finalized) for a group so a subtest
// that asserts "current" or recomputed standings starts from the seed baseline.
// The FK cascade drops attendances.
func clearAllPicks(t *testing.T, pool *pgxpool.Pool, group string) {
	t.Helper()
	if _, err := pool.Exec(context.Background(),
		"DELETE FROM picks WHERE group_id = $1", group); err != nil {
		t.Fatalf("clear all picks: %v", err)
	}
}

// doReq sends method+path (with an optional body) through mux and returns the
// status and raw response body — the one place the httptest recorder/request
// plumbing lives. Every integration test builds its own mux and passes it in.
func doReq(t *testing.T, mux http.Handler, method, path, body string) (int, []byte) {
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

// doJSON is doReq plus decoding the body into T on a 2xx status (every success
// response this API emits is JSON). On a non-2xx it returns the zero T, leaving
// the caller to assert on the status code.
func doJSON[T any](t *testing.T, mux http.Handler, method, path, body string) (int, T) {
	t.Helper()
	code, b := doReq(t, mux, method, path, body)
	var v T
	if code >= 200 && code < 300 {
		if err := json.Unmarshal(b, &v); err != nil {
			t.Fatalf("decode %s %s: %v (body %s)", method, path, err, b)
		}
	}
	return code, v
}
