//go:build integration

package main

import (
	"net/http"
	"strings"
	"testing"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// nightBody builds a create-night body: the picker plus the other attendees.
func nightBody(date, picker string, others ...string) string {
	ids := append([]string{picker}, others...)
	return `{"scheduledFor":"` + date + `","pickerId":"` + picker + `","attendees":["` + strings.Join(ids, `","`) + `"]}`
}

func TestNightAttendanceIntegration(t *testing.T) {
	pool := freshDB(t)
	seedFixtures(t, pool)

	mux := http.NewServeMux()
	q := db.New(pool)
	mux.Handle("POST /groups/{groupId}/nights", createNightHandler(q))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}", nightDetailHandler(q))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}/turn", nightTurnHandler(q))
	mux.Handle("PATCH /groups/{groupId}/nights/{nightId}", updateNightHandler(pool))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/pick", recordNightPickHandler(q))
	mux.Handle("GET /groups/{groupId}/turn", turnHandler(q))

	// run starts every subtest from the seed baseline: no nights, so dates never
	// collide (one night per date) and standings come from baseline alone.
	run := func(name string, f func(t *testing.T)) {
		t.Run(name, func(t *testing.T) {
			clearAllPicks(t, pool, seededGroup)
			f(t)
		})
	}

	do := func(t *testing.T, method, path, body string) (int, []byte) {
		t.Helper()
		return doReq(t, mux, method, path, body)
	}

	createNight := func(t *testing.T, body string) nightResponse {
		t.Helper()
		code, n := doJSON[nightResponse](t, mux, http.MethodPost, "/groups/"+seededGroup+"/nights", body)
		if code != http.StatusCreated {
			t.Fatalf("create night status = %d, want 201", code)
		}
		return n
	}

	turn := func(t *testing.T, nightID string) []turnResponse {
		t.Helper()
		code, got := doJSON[[]turnResponse](t, mux, http.MethodGet, "/groups/"+seededGroup+"/nights/"+nightID+"/turn", "")
		if code != http.StatusOK {
			t.Fatalf("turn status = %d, want 200", code)
		}
		return got
	}

	// groupTurn is the group-wide ranking (home rotation), which — unlike a
	// night's order — counts every credited pick, so standings show up here.
	groupTurn := func(t *testing.T) []turnResponse {
		t.Helper()
		code, got := doJSON[[]turnResponse](t, mux, http.MethodGet, "/groups/"+seededGroup+"/turn", "")
		if code != http.StatusOK {
			t.Fatalf("group turn status = %d, want 200", code)
		}
		return got
	}

	recordPick := func(t *testing.T, nightID, pickerID string) nightResponse {
		t.Helper()
		code, n := doJSON[nightResponse](t, mux, http.MethodPost, "/groups/"+seededGroup+"/nights/"+nightID+"/pick", `{"pickerId":"`+pickerID+`"}`)
		if code != http.StatusOK {
			t.Fatalf("record pick status = %d, want 200", code)
		}
		return n
	}

	names := func(rows []turnResponse) []string {
		out := make([]string, len(rows))
		for i, r := range rows {
			out[i] = r.Name
		}
		return out
	}

	run("create returns the night with its picker and attendees", func(t *testing.T) {
		n := createNight(t, nightBody("2026-06-12", ada, blake))
		if n.PickerID != ada {
			t.Errorf("pickerId = %q, want %s", n.PickerID, ada)
		}
		if len(n.Attendees) != 2 {
			t.Fatalf("attendees = %+v, want 2", n.Attendees)
		}
		if code, _ := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/"+n.ID, ""); code != http.StatusOK {
			t.Errorf("detail status = %d, want 200", code)
		}
	})

	run("pick order ranks attendees and excludes absent core", func(t *testing.T) {
		n := createNight(t, nightBody("2026-06-12", ada, blake))
		// The night's own pick (Ada) is ignored, so the order is the baseline one.
		if got := names(turn(t, n.ID)); len(got) != 2 || got[0] != "Ada" || got[1] != "Blake" {
			t.Fatalf("order = %v, want [Ada Blake]", got)
		}
	})

	run("guest attendee is recorded but absent from the pick order", func(t *testing.T) {
		n := createNight(t, nightBody("2026-06-12", ada, frankie))
		var sawGuest bool
		for _, a := range n.Attendees {
			if a.Name == "Frankie" && a.Role == "guest" {
				sawGuest = true
			}
		}
		if !sawGuest {
			t.Fatalf("attendees = %+v, want Frankie as guest", n.Attendees)
		}
		if got := names(turn(t, n.ID)); len(got) != 1 || got[0] != "Ada" {
			t.Fatalf("order = %v, want [Ada]", got)
		}
	})

	run("inactive member can attend but is absent from the pick order", func(t *testing.T) {
		n := createNight(t, nightBody("2026-06-12", ada, zed))
		if len(n.Attendees) != 2 {
			t.Fatalf("attendees = %+v, want 2 (Ada + Zed)", n.Attendees)
		}
		// Zed is inactive core: recorded as present, but RankGroupTurn filters to
		// active core, so the order is Ada only.
		if got := names(turn(t, n.ID)); len(got) != 1 || got[0] != "Ada" {
			t.Fatalf("order = %v, want [Ada]", got)
		}
	})

	run("editing the attendees changes the order", func(t *testing.T) {
		n := createNight(t, nightBody("2026-06-12", ada))
		if code, b := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID, `{"attendees":["`+ada+`","`+blake+`"]}`); code != http.StatusOK {
			t.Fatalf("add status = %d, want 200 (body %s)", code, b)
		}
		if got := names(turn(t, n.ID)); len(got) != 2 {
			t.Fatalf("after add: order = %v, want 2", got)
		}
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID, `{"attendees":["`+ada+`"]}`); code != http.StatusOK {
			t.Fatalf("remove status = %d, want 200", code)
		}
		if got := names(turn(t, n.ID)); len(got) != 1 || got[0] != "Ada" {
			t.Fatalf("after remove: order = %v, want [Ada]", got)
		}
	})

	run("create with a non-member attendee yields 422 and creates nothing", func(t *testing.T) {
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", nightBody("2026-06-12", ada, unknownUser)); code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want 422", code)
		}
		// The date is still free: nothing was written before the 422.
		createNight(t, nightBody("2026-06-12", ada))
	})

	run("create with a picker who is not attending yields 422", func(t *testing.T) {
		body := `{"scheduledFor":"2026-06-12","pickerId":"` + blake + `","attendees":["` + ada + `"]}`
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", body); code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want 422", code)
		}
	})

	run("a second night on the same date yields 409", func(t *testing.T) {
		createNight(t, nightBody("2026-06-12", ada))
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", nightBody("2026-06-12", blake)); code != http.StatusConflict {
			t.Fatalf("same-date status = %d, want 409", code)
		}
		createNight(t, nightBody("2026-06-19", blake))
	})

	run("unknown night yields 404", func(t *testing.T) {
		if code, _ := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/"+unknownNight, ""); code != http.StatusNotFound {
			t.Fatalf("detail status = %d, want 404", code)
		}
		if code, _ := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/"+unknownNight+"/turn", ""); code != http.StatusNotFound {
			t.Fatalf("turn status = %d, want 404", code)
		}
	})

	run("creating with a core picker credits them", func(t *testing.T) {
		createNight(t, nightBody("2026-06-12", ada, blake))
		if order := names(groupTurn(t)); len(order) != 3 || order[0] != "Blake" || order[2] != "Ada" {
			t.Fatalf("group order = %v, want Blake first and Ada last (Ada credited)", order)
		}
	})

	run("creating with a guest picker does not move standings", func(t *testing.T) {
		before := names(groupTurn(t))
		createNight(t, nightBody("2026-06-12", frankie, ada))
		if after := names(groupTurn(t)); strings.Join(after, ",") != strings.Join(before, ",") {
			t.Fatalf("guest pick changed the order: before %v after %v", before, after)
		}
	})

	run("recording a non-attendee yields 422", func(t *testing.T) {
		n := createNight(t, nightBody("2026-06-12", ada))
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+n.ID+"/pick", `{"pickerId":"`+blake+`"}`); code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want 422 (Blake is not an attendee)", code)
		}
	})

	run("recording on an unknown night yields 404; malformed picker yields 400", func(t *testing.T) {
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+unknownNight+"/pick", `{"pickerId":"`+ada+`"}`); code != http.StatusNotFound {
			t.Errorf("unknown-night status = %d, want 404", code)
		}
		n := createNight(t, nightBody("2026-06-12", ada))
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+n.ID+"/pick", `{"pickerId":"nope"}`); code != http.StatusBadRequest {
			t.Errorf("malformed-picker status = %d, want 400", code)
		}
	})

	run("a night's order ignores its own pick", func(t *testing.T) {
		n := createNight(t, nightBody("2026-06-12", ada, blake))
		before := names(turn(t, n.ID))
		// Re-recording (a correction) must not reshuffle the order the picker is
		// chosen from, or a re-advance would hand the pick to someone else.
		recordPick(t, n.ID, blake)
		if after := names(turn(t, n.ID)); strings.Join(after, ",") != strings.Join(before, ",") {
			t.Fatalf("order after correcting to Blake = %v, want unchanged %v", after, before)
		}
	})

	run("a night's order still counts other nights' picks", func(t *testing.T) {
		createNight(t, nightBody("2026-06-05", ada, blake))
		n := createNight(t, nightBody("2026-06-12", blake, ada))
		if order := names(turn(t, n.ID)); len(order) != 2 || order[0] != "Blake" {
			t.Fatalf("order = %v, want Blake first (Ada credited on an earlier night)", order)
		}
	})

	run("a pick on an upcoming night counts toward standings immediately", func(t *testing.T) {
		createNight(t, nightBody("2099-01-02", ada))
		if order := names(groupTurn(t)); len(order) != 3 || order[2] != "Ada" {
			t.Fatalf("group order = %v, want Ada last (planning ahead claims the turn)", order)
		}
	})

	run("re-recording a different attendee re-attributes standings (correction)", func(t *testing.T) {
		n := createNight(t, nightBody("2026-06-12", ada, blake))
		if order := names(groupTurn(t)); order[2] != "Ada" {
			t.Fatalf("after creating with Ada, group order = %v, want Ada last", order)
		}
		recordPick(t, n.ID, blake) // correction: now Blake credited instead
		if order := names(groupTurn(t)); order[0] != "Ada" || order[2] != "Blake" {
			t.Fatalf("after correcting to Blake, group order = %v, want Ada first and Blake last", order)
		}
	})

	run("malformed input yields 400", func(t *testing.T) {
		if code, _ := do(t, http.MethodPost, "/groups/not-a-uuid/nights", nightBody("2026-06-12", ada)); code != http.StatusBadRequest {
			t.Fatalf("bad group status = %d, want 400", code)
		}
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", nightBody("nope", ada)); code != http.StatusBadRequest {
			t.Fatalf("bad date status = %d, want 400", code)
		}
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", `{"scheduledFor":"2026-06-12","attendees":["`+ada+`"]}`); code != http.StatusBadRequest {
			t.Fatalf("missing picker status = %d, want 400", code)
		}
	})
}

func TestNightsListIntegration(t *testing.T) {
	pool := freshDB(t)
	seedFixtures(t, pool)

	mux := http.NewServeMux()
	q := db.New(pool)
	mux.Handle("GET /groups/{groupId}/nights", listNightsHandler(q))

	const (
		night1   = "b0000000-0000-0000-0000-0000000000a1" // older, has movie + attendees
		night2   = "b0000000-0000-0000-0000-0000000000a2" // newer, no movie
		upcoming = "b0000000-0000-0000-0000-0000000000a3" // dated in the future — still listed
		movieID  = "c0000000-0000-0000-0000-0000000000a1"
	)

	execSeed(t, pool, []seedStmt{
		{sql: `INSERT INTO movies (id, tmdb_id, title, release_year, poster_path)
		        VALUES ($1, 27205, 'Inception', 2010, '/inc.jpg')`, args: []any{movieID}},
		{sql: `INSERT INTO picks (id, group_id, picker_id, is_credited, scheduled_for, movie_id)
		        VALUES ($1, $2, $3, true, '2026-05-01', $4)`, args: []any{night1, seededGroup, ada, movieID}},
		{sql: `INSERT INTO picks (id, group_id, picker_id, is_credited, scheduled_for)
		        VALUES ($1, $2, $3, true, '2026-06-01')`, args: []any{night2, seededGroup, blake}},
		{sql: `INSERT INTO picks (id, group_id, picker_id, is_credited, scheduled_for)
		        VALUES ($1, $2, $3, true, '2099-07-01')`, args: []any{upcoming, seededGroup, cleo}},
		{sql: `INSERT INTO attendances (pick_id, user_id) VALUES ($1, $2), ($1, $3)`, args: []any{night1, ada, blake}},
	})

	do := func(t *testing.T, path string) (int, []nightResponse) {
		t.Helper()
		return doJSON[[]nightResponse](t, mux, http.MethodGet, path, "")
	}

	t.Run("lists every night newest-first, upcoming included", func(t *testing.T) {
		code, got := do(t, "/groups/"+seededGroup+"/nights")
		if code != http.StatusOK {
			t.Fatalf("want 200, got %d", code)
		}
		if len(got) != 3 {
			t.Fatalf("want 3 nights, got %d", len(got))
		}
		if got[0].ID != upcoming || got[1].ID != night2 || got[2].ID != night1 {
			t.Fatalf("order wrong: %s, %s, %s", got[0].ID, got[1].ID, got[2].ID)
		}
		if got[1].Movie != nil {
			t.Fatalf("night2 should have no movie, got %+v", got[1].Movie)
		}
		if got[2].Movie == nil || got[2].Movie.Title != "Inception" {
			t.Fatalf("night1 movie wrong: %+v", got[2].Movie)
		}
		if len(got[2].Attendees) != 2 {
			t.Fatalf("night1 want 2 attendees, got %d", len(got[2].Attendees))
		}
	})

	t.Run("empty group returns []", func(t *testing.T) {
		code, got := do(t, "/groups/"+emptyGroup+"/nights")
		if code != http.StatusOK {
			t.Fatalf("want 200, got %d", code)
		}
		if len(got) != 0 {
			t.Fatalf("want empty list, got %d", len(got))
		}
	})
}
