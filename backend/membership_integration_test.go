//go:build integration

package main

import (
	"bytes"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestMembershipChurnIntegration(t *testing.T) {
	pool := startPostgres(t)
	seedFixtures(t, pool)
	q := db.New(pool)

	mux := http.NewServeMux()
	mux.Handle("POST /groups/{groupId}/members", joinMemberHandler(q))
	mux.Handle("POST /groups/{groupId}/members/{userId}/deactivate", deactivateMemberHandler(q))
	mux.Handle("POST /groups/{groupId}/members/{userId}/reactivate", reactivateMemberHandler(q))
	mux.Handle("POST /groups/{groupId}/members/{userId}/promote", promoteMemberHandler(q))
	mux.Handle("POST /groups/{groupId}/picks", createPickHandler(q))
	mux.Handle("GET /groups/{groupId}/turn", turnHandler(q))

	const (
		ada  = "a0000000-0000-0000-0000-000000000001"
		cleo = "a0000000-0000-0000-0000-000000000003"
		gwen = "a0000000-0000-0000-0000-000000000006"
	)

	do := func(t *testing.T, method, path, body string) (int, memberResponse) {
		t.Helper()
		rec := httptest.NewRecorder()
		var r *http.Request
		if body == "" {
			r = httptest.NewRequest(method, path, nil)
		} else {
			r = httptest.NewRequest(method, path, bytes.NewBufferString(body))
		}
		mux.ServeHTTP(rec, r)
		var m memberResponse
		if rec.Code == http.StatusOK || rec.Code == http.StatusCreated {
			_ = json.Unmarshal(rec.Body.Bytes(), &m)
		}
		return rec.Code, m
	}

	getTurn := func(t *testing.T) []turnResponse {
		t.Helper()
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/groups/"+seededGroup+"/turn", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("turn status = %d, want 200", rec.Code)
		}
		var got []turnResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatalf("decode turn: %v", err)
		}
		return got
	}

	// roundedTurnAvg returns round(mean(servedCount)) over the current active
	// core — the same set and value the backend seeds against.
	roundedTurnAvg := func(t *testing.T) int32 {
		t.Helper()
		rows := getTurn(t)
		if len(rows) == 0 {
			return 0
		}
		var sum int32
		for _, r := range rows {
			sum += r.ServedCount
		}
		return int32(math.Round(float64(sum) / float64(len(rows))))
	}

	servedOf := func(t *testing.T, name string) (int32, bool) {
		t.Helper()
		for _, r := range getTurn(t) {
			if r.Name == name {
				return r.ServedCount, true
			}
		}
		return 0, false
	}

	recordPick := func(t *testing.T, picker, date string) {
		t.Helper()
		rec := httptest.NewRecorder()
		body := `{"pickerId":"` + picker + `","scheduledFor":"` + date + `"}`
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/groups/"+seededGroup+"/picks", bytes.NewBufferString(body)))
		if rec.Code != http.StatusCreated {
			t.Fatalf("record pick for %s: status = %d, want 201", picker, rec.Code)
		}
	}

	// Build pick history so the average is non-trivial and Cleo carries history:
	// Ada 2 credited, Blake 1, Cleo 1.
	recordPick(t, ada, "2026-05-01")
	recordPick(t, ada, "2026-05-08")
	recordPick(t, "a0000000-0000-0000-0000-000000000002", "2026-05-15") // Blake
	recordPick(t, cleo, "2026-05-22")

	t.Run("join lands the new member at the average", func(t *testing.T) {
		want := roundedTurnAvg(t)
		code, m := do(t, http.MethodPost, "/groups/"+seededGroup+"/members", `{"name":"Newbie"}`)
		if code != http.StatusCreated {
			t.Fatalf("status = %d, want 201", code)
		}
		if m.Name != "Newbie" || m.Role != "core" || m.Status != "active" || m.ID == "" {
			t.Fatalf("response = %+v", m)
		}
		got, ok := servedOf(t, "Newbie")
		if !ok {
			t.Fatal("Newbie not in /turn after join")
		}
		if got != want {
			t.Errorf("Newbie servedCount = %d, want %d (the average)", got, want)
		}
	})

	t.Run("leave removes the member; second deactivate is a no-op", func(t *testing.T) {
		code, m := do(t, http.MethodPost, "/groups/"+seededGroup+"/members/"+cleo+"/deactivate", "")
		if code != http.StatusOK || m.Status != "inactive" {
			t.Fatalf("status=%d member=%+v, want 200/inactive", code, m)
		}
		if _, ok := servedOf(t, "Cleo"); ok {
			t.Error("Cleo still in /turn after deactivate")
		}
		code, m = do(t, http.MethodPost, "/groups/"+seededGroup+"/members/"+cleo+"/deactivate", "")
		if code != http.StatusOK || m.Status != "inactive" {
			t.Errorf("idempotent deactivate: status=%d member=%+v, want 200/inactive", code, m)
		}
	})

	t.Run("return re-seeds a member with history to the average, idempotently", func(t *testing.T) {
		want := roundedTurnAvg(t) // average BEFORE Cleo re-enters (she's excluded)
		code, m := do(t, http.MethodPost, "/groups/"+seededGroup+"/members/"+cleo+"/reactivate", "")
		if code != http.StatusOK || m.Status != "active" {
			t.Fatalf("status=%d member=%+v, want 200/active", code, m)
		}
		got, ok := servedOf(t, "Cleo")
		if !ok {
			t.Fatal("Cleo not back in /turn after reactivate")
		}
		// Cleo has 1 prior credited pick; total must still equal the average,
		// proving baseline = round(avg) − 1 (not the literal round(avg)).
		if got != want {
			t.Errorf("Cleo servedCount = %d, want %d (the average, history not double-counted)", got, want)
		}
		// Second reactivate must not re-seed.
		do(t, http.MethodPost, "/groups/"+seededGroup+"/members/"+cleo+"/reactivate", "")
		if again, _ := servedOf(t, "Cleo"); again != got {
			t.Errorf("idempotent reactivate changed servedCount: %d → %d", got, again)
		}
	})

	t.Run("promote brings the guest into the rotation at the average, idempotently", func(t *testing.T) {
		want := roundedTurnAvg(t) // average BEFORE Gwen enters (guest, excluded)
		code, m := do(t, http.MethodPost, "/groups/"+seededGroup+"/members/"+gwen+"/promote", "")
		if code != http.StatusOK || m.Role != "core" || m.Status != "active" {
			t.Fatalf("status=%d member=%+v, want 200/core/active", code, m)
		}
		got, ok := servedOf(t, "Gwen")
		if !ok {
			t.Fatal("Gwen not in /turn after promote")
		}
		if got != want {
			t.Errorf("Gwen servedCount = %d, want %d (the average)", got, want)
		}
		do(t, http.MethodPost, "/groups/"+seededGroup+"/members/"+gwen+"/promote", "")
		if again, _ := servedOf(t, "Gwen"); again != got {
			t.Errorf("idempotent promote changed servedCount: %d → %d", got, again)
		}
	})

	t.Run("bad targets and input", func(t *testing.T) {
		// Unknown but well-formed userId → 404.
		code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/members/a0000000-0000-0000-0000-0000000000ff/deactivate", "")
		if code != http.StatusNotFound {
			t.Errorf("unknown user deactivate: status = %d, want 404", code)
		}
		// Malformed userId → 400.
		code, _ = do(t, http.MethodPost, "/groups/"+seededGroup+"/members/not-a-uuid/promote", "")
		if code != http.StatusBadRequest {
			t.Errorf("malformed user promote: status = %d, want 400", code)
		}
		// Empty join name → 400.
		code, _ = do(t, http.MethodPost, "/groups/"+seededGroup+"/members", `{"name":"   "}`)
		if code != http.StatusBadRequest {
			t.Errorf("empty join name: status = %d, want 400", code)
		}
	})
}
