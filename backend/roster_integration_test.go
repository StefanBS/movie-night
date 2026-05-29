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

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
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

// startPostgres boots postgres:18, runs goose migrations, returns a connected pool.
func startPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
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
		t.Fatalf("start postgres container: %v", err)
	}
	t.Cleanup(func() { _ = container.Terminate(ctx) })

	connStr, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}

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
	return pool
}

func seedFixtures(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	stmts := []struct {
		sql  string
		args []any
	}{
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
				('a0000000-0000-0000-0000-000000000009', 'Zed')`,
		},
		{
			// rotation_position deliberately out of insert order to prove ORDER BY.
			// Zed is inactive and must be excluded.
			sql: `INSERT INTO memberships (group_id, user_id, role, status, rotation_position) VALUES
				($1, 'a0000000-0000-0000-0000-000000000002', 'core', 'active', 2),
				($1, 'a0000000-0000-0000-0000-000000000001', 'core', 'active', 1),
				($1, 'a0000000-0000-0000-0000-000000000003', 'core', 'active', 3),
				($1, 'a0000000-0000-0000-0000-000000000009', 'core', 'inactive', 4)`,
			args: []any{seededGroup},
		},
	}
	for _, s := range stmts {
		if _, err := pool.Exec(ctx, s.sql, s.args...); err != nil {
			t.Fatalf("seed fixture: %v", err)
		}
	}
}

func TestMembersHandlerIntegration(t *testing.T) {
	pool := startPostgres(t)
	seedFixtures(t, pool)

	mux := http.NewServeMux()
	mux.Handle("GET /groups/{groupId}/members", membersHandler(db.New(pool)))

	get := func(t *testing.T, groupID string) (int, []memberResponse) {
		t.Helper()
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/groups/"+groupID+"/members", nil)
		mux.ServeHTTP(rec, req)
		var got []memberResponse
		if rec.Code == http.StatusOK {
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatalf("decode body: %v", err)
			}
		}
		return rec.Code, got
	}

	t.Run("active members in rotation order, inactive excluded", func(t *testing.T) {
		code, got := get(t, seededGroup)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
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
		code, got := get(t, emptyGroup)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		if len(got) != 0 {
			t.Fatalf("got %d members, want 0", len(got))
		}
	})

	t.Run("malformed group id returns 400", func(t *testing.T) {
		code, _ := get(t, "not-a-uuid")
		if code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", code)
		}
	})
}
