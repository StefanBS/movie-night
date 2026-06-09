//go:build integration

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

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

	t.Run("a real recorded pick is not reachable as a night (seam closed)", func(t *testing.T) {
		// A pick created via the record-pick path has a non-null picker, so it is
		// NOT a planned night. GetNight is scoped to picker_id IS NULL, so every
		// night endpoint must 404 on its id — this guards the interim seam against
		// a future refactor accidentally reopening it.
		pick, err := q.InsertPick(context.Background(), db.InsertPickParams{
			GroupID:      uuid.MustParse(seededGroup),
			PickerID:     pgtype.UUID{Bytes: uuid.MustParse(ada), Valid: true},
			IsCredited:   true,
			ScheduledFor: pgtype.Date{Time: time.Date(2026, 6, 12, 0, 0, 0, 0, time.UTC), Valid: true},
		})
		if err != nil {
			t.Fatalf("insert recorded pick: %v", err)
		}
		pid := pick.ID.String()

		if code, _ := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/"+pid, ""); code != http.StatusNotFound {
			t.Errorf("detail status = %d, want 404", code)
		}
		if code, _ := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/"+pid+"/turn", ""); code != http.StatusNotFound {
			t.Errorf("turn status = %d, want 404", code)
		}
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights/"+pid+"/attendees", `{"userId":"`+ada+`"}`); code != http.StatusNotFound {
			t.Errorf("add status = %d, want 404", code)
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

	t.Run("current night excludes a finalized (recorded) pick", func(t *testing.T) {
		// A recorded pick (picker set) in an otherwise night-less group must not be
		// returned as the current planned night.
		if _, err := q.InsertPick(context.Background(), db.InsertPickParams{
			GroupID:      uuid.MustParse(emptyGroup),
			PickerID:     pgtype.UUID{Bytes: uuid.MustParse(ada), Valid: true},
			IsCredited:   true,
			ScheduledFor: pgtype.Date{Time: time.Date(2026, 6, 12, 0, 0, 0, 0, time.UTC), Valid: true},
		}); err != nil {
			t.Fatalf("insert recorded pick: %v", err)
		}
		if code, _ := do(t, http.MethodGet, "/groups/"+emptyGroup+"/nights/current", ""); code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404 (recorded pick must not count as current)", code)
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
