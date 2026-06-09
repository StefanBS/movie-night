//go:build integration

package main

import (
	"bytes"
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

	createNight := func(t *testing.T, body string) nightResponse {
		t.Helper()
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
		code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", `{"scheduledFor":"2026-06-12","attendees":["`+unknown+`"]}`)
		if code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want 422", code)
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

	t.Run("malformed ids yield 400", func(t *testing.T) {
		if code, _ := do(t, http.MethodPost, "/groups/not-a-uuid/nights", `{"scheduledFor":"2026-06-12"}`); code != http.StatusBadRequest {
			t.Fatalf("bad group status = %d, want 400", code)
		}
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", `{"scheduledFor":"nope"}`); code != http.StatusBadRequest {
			t.Fatalf("bad date status = %d, want 400", code)
		}
	})
}
