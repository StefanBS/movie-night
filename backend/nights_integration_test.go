//go:build integration

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestNightAttendanceIntegration(t *testing.T) {
	pool := startPostgres(t)
	seedFixtures(t, pool)

	mux := http.NewServeMux()
	q := db.New(pool)
	mux.Handle("POST /groups/{groupId}/nights", createNightHandler(q))
	mux.Handle("GET /groups/{groupId}/nights/current", currentNightHandler(q))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}", nightDetailHandler(q))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}/turn", nightTurnHandler(q))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/attendees", addAttendeeHandler(q))
	mux.Handle("DELETE /groups/{groupId}/nights/{nightId}/attendees/{userId}", removeAttendeeHandler(q))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/pick", recordNightPickHandler(q))

	const (
		ada     = "a0000000-0000-0000-0000-000000000001"
		blake   = "a0000000-0000-0000-0000-000000000002"
		frankie = "a0000000-0000-0000-0000-000000000006" // active guest
		unknown = "a0000000-0000-0000-0000-0000000000ff"
		zed     = "a0000000-0000-0000-0000-000000000009" // inactive core
	)

	do := func(t *testing.T, method, path, body string) (int, []byte) {
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

	// clearOpenNight deletes seededGroup's open night (picker_id NULL) so a
	// subtest starts from a clean slate. A group may have only one open night at
	// a time (uq_open_night_per_group), so without this the next create would
	// resume the prior subtest's night instead of making a fresh one. The FK
	// cascade drops its attendances.
	clearOpenNight := func(t *testing.T) {
		t.Helper()
		if _, err := pool.Exec(context.Background(),
			"DELETE FROM picks WHERE group_id = $1 AND picker_id IS NULL", seededGroup); err != nil {
			t.Fatalf("clear open night: %v", err)
		}
	}

	// clearAllPicks removes every pick (open and finalized) for a group so a
	// subtest that asserts "current" or recomputed standings starts from the seed
	// baseline. The FK cascade drops attendances.
	clearAllPicks := func(t *testing.T, group string) {
		t.Helper()
		if _, err := pool.Exec(context.Background(),
			"DELETE FROM picks WHERE group_id = $1", group); err != nil {
			t.Fatalf("clear all picks: %v", err)
		}
	}

	createNight := func(t *testing.T, body string) nightResponse {
		t.Helper()
		clearOpenNight(t)
		code, b := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", body)
		if code != http.StatusCreated {
			t.Fatalf("create night status = %d, want 201 (body %s)", code, b)
		}
		var n nightResponse
		if err := json.Unmarshal(b, &n); err != nil {
			t.Fatalf("decode night: %v", err)
		}
		return n
	}

	turn := func(t *testing.T, nightID string) []turnResponse {
		t.Helper()
		code, b := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/"+nightID+"/turn", "")
		if code != http.StatusOK {
			t.Fatalf("turn status = %d, want 200 (body %s)", code, b)
		}
		var got []turnResponse
		if err := json.Unmarshal(b, &got); err != nil {
			t.Fatalf("decode turn: %v", err)
		}
		return got
	}

	recordPick := func(t *testing.T, nightID, pickerID string) nightResponse {
		t.Helper()
		code, b := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+nightID+"/pick", `{"pickerId":"`+pickerID+`"}`)
		if code != http.StatusOK {
			t.Fatalf("record pick status = %d, want 200 (body %s)", code, b)
		}
		var n nightResponse
		if err := json.Unmarshal(b, &n); err != nil {
			t.Fatalf("decode night: %v", err)
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

	t.Run("pick order ranks attendees and excludes absent core", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`","`+blake+`"]}`)
		if len(n.Attendees) != 2 {
			t.Fatalf("attendees = %+v, want 2", n.Attendees)
		}
		got := names(turn(t, n.ID))
		if len(got) != 2 || got[0] != "Ada" || got[1] != "Blake" {
			t.Fatalf("order = %v, want [Ada Blake]", got)
		}
	})

	t.Run("guest attendee is recorded but absent from the pick order", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`","`+frankie+`"]}`)
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

	t.Run("add then remove attendee changes the order", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`"]}`)
		if code, b := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+n.ID+"/attendees", `{"userId":"`+blake+`"}`); code != http.StatusCreated {
			t.Fatalf("add status = %d, want 201 (body %s)", code, b)
		}
		if got := names(turn(t, n.ID)); len(got) != 2 {
			t.Fatalf("after add: order = %v, want 2", got)
		}
		if code, _ := do(t, http.MethodDelete, "/groups/"+seededGroup+"/nights/"+n.ID+"/attendees/"+blake, ""); code != http.StatusOK {
			t.Fatalf("remove status = %d, want 200", code)
		}
		if got := names(turn(t, n.ID)); len(got) != 1 || got[0] != "Ada" {
			t.Fatalf("after remove: order = %v, want [Ada]", got)
		}
	})

	t.Run("empty night ranks nobody", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12"}`)
		if got := turn(t, n.ID); len(got) != 0 {
			t.Fatalf("order = %+v, want []", got)
		}
	})

	t.Run("add non-member yields 422", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12"}`)
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+n.ID+"/attendees", `{"userId":"`+unknown+`"}`); code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want 422", code)
		}
	})

	t.Run("create with a non-member initial attendee yields 422", func(t *testing.T) {
		// Initial-attendee validation only runs when actually creating — so this
		// must start with no open night, else create would resume and skip it.
		clearOpenNight(t)
		code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", `{"scheduledFor":"2026-06-12","attendees":["`+unknown+`"]}`)
		if code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want 422", code)
		}
	})

	t.Run("creating a night when one is open resumes it (idempotent)", func(t *testing.T) {
		first := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`"]}`)
		// A second create must NOT open a new night (uq_open_night_per_group). It
		// returns the already-open night with 200, and the new body is ignored.
		code, b := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", `{"scheduledFor":"2026-07-01","attendees":["`+blake+`"]}`)
		if code != http.StatusOK {
			t.Fatalf("repeat create status = %d, want 200 (body %s)", code, b)
		}
		var got nightResponse
		if err := json.Unmarshal(b, &got); err != nil {
			t.Fatalf("decode night: %v", err)
		}
		if got.ID != first.ID {
			t.Errorf("repeat create id = %s, want the open night %s", got.ID, first.ID)
		}
		if got.ScheduledFor != "2026-06-12" {
			t.Errorf("scheduledFor = %s, want 2026-06-12 (resumed, not overwritten)", got.ScheduledFor)
		}
		if len(got.Attendees) != 1 || got.Attendees[0].Name != "Ada" {
			t.Errorf("attendees = %+v, want [Ada] (resumed, body's Blake ignored)", got.Attendees)
		}
	})

	t.Run("inactive member can attend but is absent from the pick order", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`","`+zed+`"]}`)
		if len(n.Attendees) != 2 {
			t.Fatalf("attendees = %+v, want 2 (Ada + Zed)", n.Attendees)
		}
		// Zed is inactive core: recorded as present, but RankGroupTurn filters to
		// active core, so the order is Ada only.
		if got := names(turn(t, n.ID)); len(got) != 1 || got[0] != "Ada" {
			t.Fatalf("order = %v, want [Ada]", got)
		}
	})

	t.Run("unknown night yields 404", func(t *testing.T) {
		missing := "b0000000-0000-0000-0000-0000000000ee"
		if code, _ := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/"+missing, ""); code != http.StatusNotFound {
			t.Fatalf("detail status = %d, want 404", code)
		}
		if code, _ := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/"+missing+"/turn", ""); code != http.StatusNotFound {
			t.Fatalf("turn status = %d, want 404", code)
		}
	})

	t.Run("recording a core picker finalizes the night and credits them", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`","`+blake+`"]}`)
		got := recordPick(t, n.ID, ada)
		if got.PickerID == nil || *got.PickerID != ada {
			t.Fatalf("pickerId = %v, want %s", got.PickerID, ada)
		}
		if code, _ := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/"+n.ID, ""); code != http.StatusOK {
			t.Errorf("detail of finalized night = %d, want 200", code)
		}
		if order := names(turn(t, n.ID)); len(order) != 2 || order[0] != "Blake" {
			t.Fatalf("post-pick order = %v, want Blake first (Ada credited)", order)
		}
	})

	t.Run("recording a guest picker does not move standings", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`","`+frankie+`"]}`)
		before := names(turn(t, n.ID))
		got := recordPick(t, n.ID, frankie)
		if got.PickerID == nil || *got.PickerID != frankie {
			t.Fatalf("pickerId = %v, want %s", got.PickerID, frankie)
		}
		if after := names(turn(t, n.ID)); len(after) != len(before) || after[0] != "Ada" {
			t.Fatalf("guest pick changed the order: before %v after %v", before, after)
		}
	})

	t.Run("recording a non-attendee yields 422", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`"]}`)
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+n.ID+"/pick", `{"pickerId":"`+blake+`"}`); code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want 422 (Blake is not an attendee)", code)
		}
	})

	t.Run("recording on an unknown night yields 404; malformed picker yields 400", func(t *testing.T) {
		missing := "b0000000-0000-0000-0000-0000000000ee"
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+missing+"/pick", `{"pickerId":"`+ada+`"}`); code != http.StatusNotFound {
			t.Errorf("unknown-night status = %d, want 404", code)
		}
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`"]}`)
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+n.ID+"/pick", `{"pickerId":"nope"}`); code != http.StatusBadRequest {
			t.Errorf("malformed-picker status = %d, want 400", code)
		}
	})

	t.Run("current night resumes the latest planned night", func(t *testing.T) {
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`"]}`)
		code, b := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/current", "")
		if code != http.StatusOK {
			t.Fatalf("current status = %d, want 200 (body %s)", code, b)
		}
		var got nightResponse
		if err := json.Unmarshal(b, &got); err != nil {
			t.Fatalf("decode current: %v", err)
		}
		// Only one night is open per group (uq_open_night_per_group), so current
		// must be exactly the night we just created.
		if got.ID != n.ID {
			t.Errorf("current id = %s, want the just-created night %s", got.ID, n.ID)
		}
		if len(got.Attendees) != 1 || got.Attendees[0].Name != "Ada" {
			t.Errorf("current attendees = %+v, want [Ada]", got.Attendees)
		}
	})

	t.Run("current night is 404 when the group has no planned night", func(t *testing.T) {
		// emptyGroup has no nights at all.
		if code, _ := do(t, http.MethodGet, "/groups/"+emptyGroup+"/nights/current", ""); code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", code)
		}
	})

	t.Run("current night resumes a finalized night across sessions", func(t *testing.T) {
		clearAllPicks(t, seededGroup)
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`"]}`)
		recordPick(t, n.ID, ada) // finalize it
		code, b := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/current", "")
		if code != http.StatusOK {
			t.Fatalf("current status = %d, want 200 (finalized night must still resume) (body %s)", code, b)
		}
		var got nightResponse
		if err := json.Unmarshal(b, &got); err != nil {
			t.Fatalf("decode current: %v", err)
		}
		if got.ID != n.ID {
			t.Errorf("current id = %s, want the finalized night %s", got.ID, n.ID)
		}
		if got.PickerID == nil || *got.PickerID != ada {
			t.Errorf("current pickerId = %v, want %s", got.PickerID, ada)
		}
	})

	t.Run("re-recording a different attendee re-attributes standings (correction)", func(t *testing.T) {
		clearAllPicks(t, seededGroup)
		n := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`","`+blake+`"]}`)
		recordPick(t, n.ID, ada) // Ada credited → Blake leads
		if order := names(turn(t, n.ID)); order[0] != "Blake" {
			t.Fatalf("after recording Ada, order = %v, want Blake first", order)
		}
		recordPick(t, n.ID, blake) // correction: now Blake credited → Ada leads
		if order := names(turn(t, n.ID)); order[0] != "Ada" {
			t.Fatalf("after correcting to Blake, order = %v, want Ada first", order)
		}
	})

	t.Run("starting a new night after finalizing creates a fresh open night", func(t *testing.T) {
		clearAllPicks(t, seededGroup)
		first := createNight(t, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`"]}`)
		recordPick(t, first.ID, ada) // finalize → no open night remains
		code, b := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", `{"scheduledFor":"2026-06-19","attendees":["`+blake+`"]}`)
		if code != http.StatusCreated {
			t.Fatalf("start-next status = %d, want 201 (body %s)", code, b)
		}
		var second nightResponse
		if err := json.Unmarshal(b, &second); err != nil {
			t.Fatalf("decode second night: %v", err)
		}
		if second.ID == first.ID {
			t.Fatal("start-next returned the finalized night; want a brand-new open night")
		}
		_, cb := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/current", "")
		var cur nightResponse
		if err := json.Unmarshal(cb, &cur); err != nil {
			t.Fatalf("decode current: %v", err)
		}
		if cur.ID != second.ID {
			t.Errorf("current id = %s, want the new open night %s", cur.ID, second.ID)
		}
	})

	t.Run("malformed ids yield 400", func(t *testing.T) {
		if code, _ := do(t, http.MethodPost, "/groups/not-a-uuid/nights", `{"scheduledFor":"2026-06-12"}`); code != http.StatusBadRequest {
			t.Fatalf("bad group status = %d, want 400", code)
		}
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", `{"scheduledFor":"nope"}`); code != http.StatusBadRequest {
			t.Fatalf("bad date status = %d, want 400", code)
		}
	})
}

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
		movieID = "c0000000-0000-0000-0000-0000000000a1"
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
