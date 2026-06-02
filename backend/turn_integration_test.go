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
}
