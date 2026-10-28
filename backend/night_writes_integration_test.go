//go:build integration

package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// A write that arrives while another write holds the Night must decide against
// the Night as that write leaves it, not as it was before: otherwise the two
// together can leave a picker who isn't attending (ADR-0008).
func TestNightWritesWaitForEachOther(t *testing.T) {
	pool := freshDB(t)
	seedFixtures(t, pool)

	mux := http.NewServeMux()
	q := db.New(pool)
	mux.Handle("POST /groups/{groupId}/nights", createNightHandler(pool))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}", nightDetailHandler(q))
	mux.Handle("PATCH /groups/{groupId}/nights/{nightId}", updateNightHandler(pool))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/pick", recordNightPickHandler(pool))

	// mkNight is a Night Ada picks, with Blake attending.
	mkNight := func(t *testing.T) (nightResponse, string) {
		t.Helper()
		clearAllPicks(t, pool, seededGroup)
		code, n := doJSON[nightResponse](t, mux, http.MethodPost, "/groups/"+seededGroup+"/nights", nightBody("2026-06-12", ada, blake))
		if code != http.StatusCreated {
			t.Fatalf("create night = %d", code)
		}
		return n, "/groups/" + seededGroup + "/nights/" + n.ID
	}

	t.Run("a pick waits for an edit that removes the picker", func(t *testing.T) {
		n, path := mkNight(t)
		// The edit, mid-transaction: Night locked, Blake removed.
		code := whileHolding(t, pool, n.ID, `DELETE FROM attendances WHERE pick_id = $1 AND user_id = $2`, []any{n.ID, blake},
			mux, http.MethodPost, path+"/pick", `{"pickerId":"`+blake+`"}`)
		if code != http.StatusUnprocessableEntity {
			t.Errorf("record pick status = %d, want 422 (Blake left the Night)", code)
		}
		if _, got := doJSON[nightResponse](t, mux, http.MethodGet, path, ""); got.PickerID != ada {
			t.Errorf("picker = %s, want Ada (unchanged)", got.PickerID)
		}
	})

	t.Run("an edit waits for a pick that moves to the attendee it removes", func(t *testing.T) {
		n, path := mkNight(t)
		// The pick, mid-transaction: Night locked, Blake made the picker.
		code := whileHolding(t, pool, n.ID, `UPDATE picks SET picker_id = $2 WHERE id = $1`, []any{n.ID, blake},
			mux, http.MethodPatch, path, editBody(t, n, func(r *updateNightRequest) { r.Attendees = []string{ada} }))
		if code != http.StatusUnprocessableEntity {
			t.Errorf("edit status = %d, want 422 (it would drop the new picker)", code)
		}
		if _, got := doJSON[nightResponse](t, mux, http.MethodGet, path, ""); len(got.Attendees) != 2 {
			t.Errorf("attendees = %v, want Ada and Blake (unchanged)", attendeeIDs(got))
		}
	})
}

// whileHolding plays a concurrent Night write: it locks the Night and runs sql
// in an open transaction, sends the request, waits until the request is
// blocked on that lock, then commits. It returns the request's status.
func whileHolding(t *testing.T, pool *pgxpool.Pool, nightID, sql string, args []any, mux http.Handler, method, path, body string) int {
	t.Helper()
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `SELECT 1 FROM picks WHERE id = $1 FOR UPDATE`, nightID); err != nil {
		t.Fatalf("lock night: %v", err)
	}
	if _, err := tx.Exec(ctx, sql, args...); err != nil {
		t.Fatalf("concurrent write: %v", err)
	}

	// The request runs off the test goroutine, so it must not touch t.
	status := make(chan int, 1)
	go func() {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(method, path, strings.NewReader(body)))
		status <- rec.Code
	}()
	waitForLockWaiter(t, pool)
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit: %v", err)
	}
	return <-status
}

// waitForLockWaiter blocks until some session is waiting on a row lock, i.e.
// the request under test has reached the Night the test is holding.
func waitForLockWaiter(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var waiting int
		if err := pool.QueryRow(context.Background(),
			`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
		).Scan(&waiting); err != nil {
			t.Fatalf("poll lock waiters: %v", err)
		}
		if waiting > 0 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("no request ever waited on the Night's lock")
}
