//go:build integration

package main

import (
	"context"
	"net/http"
	"testing"
)

func TestDevReseedIntegration(t *testing.T) {
	pool := freshDB(t)
	// seedFixtures' Zed and "Empty Crew" aren't in seed.sql, so they show
	// whether a reseed really emptied the tables first.
	seedFixtures(t, pool)

	count := func(t *testing.T, sql string) int {
		t.Helper()
		var n int
		if err := pool.QueryRow(context.Background(), sql).Scan(&n); err != nil {
			t.Fatalf("count: %v", err)
		}
		return n
	}

	t.Run("the API's routes have no reseed", func(t *testing.T) {
		mux := newRoutes(pool, nil)
		code, _ := doReq(t, mux, http.MethodPost, "/dev/reseed", "")
		if code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", code)
		}
		if n := count(t, `SELECT count(*) FROM users WHERE id = '`+zed+`'`); n != 1 {
			t.Errorf("Zed rows = %d, want 1: the data must be untouched", n)
		}
	})

	mux := newRoutes(pool, nil)
	addDevRoutes(mux, pool)

	// Twice: the second run starts from the seed, as every e2e flow but the
	// first does.
	for _, run := range []string{"first", "second"} {
		t.Run(run+" reseed leaves exactly the dev seed", func(t *testing.T) {
			code, b := doReq(t, mux, http.MethodPost, "/dev/reseed", "")
			if code != http.StatusNoContent {
				t.Fatalf("status = %d, want 204 (body %s)", code, b)
			}
			for _, c := range []struct {
				name, sql string
				want      int
			}{
				{"groups", `SELECT count(*) FROM groups`, 1},
				{"users", `SELECT count(*) FROM users`, 6},
				{"Zed", `SELECT count(*) FROM users WHERE id = '` + zed + `'`, 0},
				{"nights", `SELECT count(*) FROM nights`, 4},
			} {
				if n := count(t, c.sql); n != c.want {
					t.Errorf("%s = %d, want %d", c.name, n, c.want)
				}
			}
			code, g := doJSON[groupResponse](t, mux, http.MethodGet, "/groups/"+seededGroup, "")
			if code != http.StatusOK || g.Name != "Friday Film Club" {
				t.Errorf("GET seeded group = %d %q, want 200 \"Friday Film Club\"", code, g.Name)
			}
		})
	}
}
