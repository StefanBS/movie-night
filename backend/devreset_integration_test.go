//go:build integration

package main

import (
	"context"
	"net/http"
	"slices"
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

func TestDevReseedFixturesIntegration(t *testing.T) {
	pool := freshDB(t)
	mux := newRoutes(pool, nil)
	addDevRoutes(mux, pool)
	const fixtureNight = "c0000000-0000-0000-0000-000000000005"
	// Not the database's CURRENT_DATE, so a fixture that ignored today would
	// show.
	const today = "2030-01-02"

	for _, c := range []struct {
		fixture string
		watched bool
	}{
		{"tonight-planned", false},
		{"tonight-watched", true},
	} {
		t.Run(c.fixture+" is plan-night's Night on today", func(t *testing.T) {
			code, b := doReq(t, mux, http.MethodPost, "/dev/reseed?fixture="+c.fixture+"&today="+today, "")
			if code != http.StatusNoContent {
				t.Fatalf("reseed status = %d, want 204 (body %s)", code, b)
			}
			code, n := doJSON[nightResponse](t, mux, http.MethodGet, "/groups/"+seededGroup+"/nights/"+fixtureNight, "")
			if code != http.StatusOK {
				t.Fatalf("GET fixture night = %d, want 200", code)
			}
			if n.ScheduledFor != today {
				t.Errorf("scheduledFor = %q, want %q", n.ScheduledFor, today)
			}
			if n.PickerID != ada {
				t.Errorf("picker = %q, want Ada", n.PickerID)
			}
			if got := attendeeIDs(n); !slices.Equal(got, []string{ada, blake}) {
				t.Errorf("attendees = %v, want Ada and Blake", got)
			}
			if n.Movie == nil || n.Movie.TMDBID != 438631 || n.Movie.Title != "Dune" {
				t.Errorf("movie = %+v, want Dune (438631)", n.Movie)
			}
			if got := n.WatchedAt != nil; got != c.watched {
				t.Errorf("watched = %t, want %t", got, c.watched)
			}
		})
	}

	t.Run("a bare reseed drops the fixture", func(t *testing.T) {
		if code, b := doReq(t, mux, http.MethodPost, "/dev/reseed", ""); code != http.StatusNoContent {
			t.Fatalf("reseed status = %d, want 204 (body %s)", code, b)
		}
		if code, _ := doReq(t, mux, http.MethodGet, "/groups/"+seededGroup+"/nights/"+fixtureNight, ""); code != http.StatusNotFound {
			t.Errorf("GET fixture night = %d, want 404", code)
		}
	})

	for _, c := range []struct{ name, query string }{
		{"unknown fixture", "fixture=nope&today=" + today},
		{"a path out of fixtures/", "fixture=../seed&today=" + today},
		{"fixture without today", "fixture=tonight-planned"},
		{"malformed today", "fixture=tonight-planned&today=02/01/2030"},
	} {
		t.Run(c.name+" is 400", func(t *testing.T) {
			if code, b := doReq(t, mux, http.MethodPost, "/dev/reseed?"+c.query, ""); code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400 (body %s)", code, b)
			}
		})
	}
}

func TestDevReseedClaimedIntegration(t *testing.T) {
	pool := freshDB(t)
	mux := newRoutes(pool, nil)
	addDevRoutes(mux, pool)
	reseed := func(t *testing.T, query string) {
		t.Helper()
		if code, b := doReq(t, mux, http.MethodPost, "/dev/reseed"+query, ""); code != http.StatusNoContent {
			t.Fatalf("reseed%s status = %d, want 204 (body %s)", query, code, b)
		}
	}
	reseed(t, "")
	// Blake, as the phone is after switch-identity: claimed=1 keeps the phone
	// claimed but as Ada, who the next flow expects.
	code, c := doJSON[claimResponse](t, mux, http.MethodPost, "/identity",
		`{"groupId":"`+seededGroup+`","userId":"`+blake+`"}`)
	if code != http.StatusCreated {
		t.Fatalf("claim status = %d, want 201", code)
	}
	whoAmI := func(t *testing.T) (int, identityResponse) {
		t.Helper()
		return doJSONAuth[identityResponse](t, mux, http.MethodGet, "/identity", "", "Bearer "+c.Token)
	}

	reseed(t, "?claimed=1&fixture=tonight-planned&today=2030-01-02")
	if code, id := whoAmI(t); code != http.StatusOK || id.ID != ada {
		t.Errorf("after claimed=1: GET /identity = %d %+v, want 200 Ada", code, id)
	}
	reseed(t, "?claimed=1")
	if code, id := whoAmI(t); code != http.StatusOK || id.ID != ada {
		t.Errorf("after a second claimed=1: GET /identity = %d %+v, want 200 Ada", code, id)
	}
	reseed(t, "")
	if code, _ := whoAmI(t); code != http.StatusUnauthorized {
		t.Errorf("after a bare reseed: GET /identity = %d, want 401: the token is revoked", code)
	}
}
