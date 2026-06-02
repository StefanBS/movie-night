//go:build integration

package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// seedTurnPicks adds pick history for the seeded group on top of seedFixtures.
// Ada: one NON-credited pick (must be ignored). Blake: one credited pick
// (2026-05-01). Cleo: one credited pick (2026-04-10, older than Blake's).
func seedTurnPicks(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	sql := `INSERT INTO picks (group_id, picker_id, is_credited, scheduled_for) VALUES
		($1, 'a0000000-0000-0000-0000-000000000001', false, '2026-05-20'),
		($1, 'a0000000-0000-0000-0000-000000000002', true,  '2026-05-01'),
		($1, 'a0000000-0000-0000-0000-000000000003', true,  '2026-04-10')`
	if _, err := pool.Exec(ctx, sql, seededGroup); err != nil {
		t.Fatalf("seed picks: %v", err)
	}
}

// seedBaselineGroup seeds a separate group whose ranking is decided by
// baseline_picks rather than credited picks: Pat has baseline 2 and no picks
// (served 2); Quinn has baseline 0 and one credited pick (served 1). The correct
// order is therefore Quinn, Pat — which only holds if the query adds
// baseline_picks. If that term regressed, Pat (served 0, never picked) would sort
// first instead. Uses its own group/users so it cannot disturb the other subtests.
func seedBaselineGroup(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	ctx := context.Background()
	const group = "33333333-3333-3333-3333-333333333333"
	stmts := []struct {
		sql  string
		args []any
	}{
		{sql: `INSERT INTO groups (id, name) VALUES ($1, 'Baseline Crew')`, args: []any{group}},
		{sql: `INSERT INTO users (id, name) VALUES
			('a0000000-0000-0000-0000-000000000007', 'Pat'),
			('a0000000-0000-0000-0000-000000000008', 'Quinn')`},
		{sql: `INSERT INTO memberships (group_id, user_id, role, status, baseline_picks, rotation_position) VALUES
			($1, 'a0000000-0000-0000-0000-000000000007', 'core', 'active', 2, 1),
			($1, 'a0000000-0000-0000-0000-000000000008', 'core', 'active', 0, 2)`, args: []any{group}},
		{sql: `INSERT INTO picks (group_id, picker_id, is_credited, scheduled_for) VALUES
			($1, 'a0000000-0000-0000-0000-000000000008', true, '2026-03-01')`, args: []any{group}},
	}
	for _, s := range stmts {
		if _, err := pool.Exec(ctx, s.sql, s.args...); err != nil {
			t.Fatalf("seed baseline group: %v", err)
		}
	}
	return group
}

func TestTurnHandlerIntegration(t *testing.T) {
	pool := startPostgres(t)
	seedFixtures(t, pool)
	seedTurnPicks(t, pool)

	mux := http.NewServeMux()
	mux.Handle("GET /groups/{groupId}/turn", turnHandler(db.New(pool)))

	get := func(t *testing.T, groupID, present string) (int, []turnResponse) {
		t.Helper()
		path := "/groups/" + groupID + "/turn"
		if present != "" {
			path += "?present=" + present
		}
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		mux.ServeHTTP(rec, req)
		var got []turnResponse
		if rec.Code == http.StatusOK {
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatalf("decode body: %v", err)
			}
		}
		return rec.Code, got
	}

	const (
		blake = "a0000000-0000-0000-0000-000000000002"
		cleo  = "a0000000-0000-0000-0000-000000000003"
		zed   = "a0000000-0000-0000-0000-000000000009" // inactive
	)

	t.Run("default ranks least-served first; non-credited pick ignored", func(t *testing.T) {
		code, got := get(t, seededGroup, "")
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		wantNames := []string{"Ada", "Cleo", "Blake"}
		if len(got) != len(wantNames) {
			t.Fatalf("got %d members, want %d (%+v)", len(got), len(wantNames), got)
		}
		for i, name := range wantNames {
			if got[i].Name != name {
				t.Errorf("[%d] name = %q, want %q", i, got[i].Name, name)
			}
		}
		if got[0].ServedCount != 0 {
			t.Errorf("Ada servedCount = %d, want 0", got[0].ServedCount)
		}
		if got[0].LastPickedOn != nil {
			t.Errorf("Ada lastPickedOn = %v, want null", *got[0].LastPickedOn)
		}
		if got[1].ServedCount != 1 || got[2].ServedCount != 1 {
			t.Errorf("Cleo/Blake servedCount = %d/%d, want 1/1", got[1].ServedCount, got[2].ServedCount)
		}
		if got[1].LastPickedOn == nil || *got[1].LastPickedOn != "2026-04-10" {
			t.Errorf("Cleo lastPickedOn = %v, want 2026-04-10", got[1].LastPickedOn)
		}
		if got[2].LastPickedOn == nil || *got[2].LastPickedOn != "2026-05-01" {
			t.Errorf("Blake lastPickedOn = %v, want 2026-05-01", got[2].LastPickedOn)
		}
	})

	t.Run("present subset filters the ranking", func(t *testing.T) {
		code, got := get(t, seededGroup, blake+","+cleo)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		wantNames := []string{"Cleo", "Blake"}
		if len(got) != len(wantNames) {
			t.Fatalf("got %d members, want %d (%+v)", len(got), len(wantNames), got)
		}
		for i, name := range wantNames {
			if got[i].Name != name {
				t.Errorf("[%d] name = %q, want %q", i, got[i].Name, name)
			}
		}
	})

	t.Run("present set containing only inactive members returns empty", func(t *testing.T) {
		code, got := get(t, seededGroup, zed)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		if len(got) != 0 {
			t.Fatalf("got %d members, want 0 (%+v)", len(got), got)
		}
	})

	t.Run("malformed present value returns 400", func(t *testing.T) {
		code, _ := get(t, seededGroup, "not-a-uuid")
		if code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", code)
		}
	})

	t.Run("baseline_picks counts toward the served order", func(t *testing.T) {
		group := seedBaselineGroup(t, pool)
		code, got := get(t, group, "")
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		// Quinn (baseline 0 + 1 credited = 1) must rank ahead of Pat (baseline 2
		// + 0 credited = 2). If the query dropped the baseline term, Pat would be
		// served 0 (never picked) and wrongly sort first.
		wantNames := []string{"Quinn", "Pat"}
		if len(got) != len(wantNames) {
			t.Fatalf("got %d members, want %d (%+v)", len(got), len(wantNames), got)
		}
		for i, name := range wantNames {
			if got[i].Name != name {
				t.Errorf("[%d] name = %q, want %q", i, got[i].Name, name)
			}
		}
		if got[0].ServedCount != 1 {
			t.Errorf("Quinn servedCount = %d, want 1", got[0].ServedCount)
		}
		if got[1].ServedCount != 2 {
			t.Errorf("Pat servedCount = %d, want 2", got[1].ServedCount)
		}
	})
}
