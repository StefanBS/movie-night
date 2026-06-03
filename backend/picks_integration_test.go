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

func TestCreatePickHandlerIntegration(t *testing.T) {
	pool := startPostgres(t)
	seedFixtures(t, pool)

	mux := http.NewServeMux()
	mux.Handle("POST /groups/{groupId}/picks", createPickHandler(db.New(pool)))
	mux.Handle("GET /groups/{groupId}/turn", turnHandler(db.New(pool)))

	post := func(t *testing.T, groupID, body string) (int, pickResponse) {
		t.Helper()
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/groups/"+groupID+"/picks", bytes.NewBufferString(body))
		mux.ServeHTTP(rec, req)
		var got pickResponse
		if rec.Code == http.StatusCreated {
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatalf("decode body: %v", err)
			}
		}
		return rec.Code, got
	}

	getTurn := func(t *testing.T, groupID string) []turnResponse {
		t.Helper()
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/groups/"+groupID+"/turn", nil)
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("turn status = %d, want 200", rec.Code)
		}
		var got []turnResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatalf("decode turn: %v", err)
		}
		return got
	}

	const ada = "a0000000-0000-0000-0000-000000000001"

	t.Run("records a credited pick and the standings advance", func(t *testing.T) {
		// Before any pick, all active core members are served 0, so Ada
		// (rotation_position 1) leads the ranking.
		before := getTurn(t, seededGroup)
		if len(before) == 0 || before[0].Name != "Ada" {
			t.Fatalf("precondition: leader = %+v, want Ada first", before)
		}

		code, got := post(t, seededGroup, `{"pickerId":"`+ada+`","scheduledFor":"2026-06-02"}`)
		if code != http.StatusCreated {
			t.Fatalf("status = %d, want 201", code)
		}
		if got.PickerID != ada || got.GroupID != seededGroup || got.ScheduledFor != "2026-06-02" || !got.IsCredited {
			t.Errorf("response = %+v", got)
		}
		if got.ID == "" || got.CreatedAt == "" {
			t.Errorf("missing id/createdAt: %+v", got)
		}

		// After: Ada is served 1, so she no longer leads and her count is 1.
		after := getTurn(t, seededGroup)
		if after[0].Name == "Ada" {
			t.Errorf("Ada still leads after picking: %+v", after)
		}
		var adaServed int32 = -1
		for _, m := range after {
			if m.Name == "Ada" {
				adaServed = m.ServedCount
			}
		}
		if adaServed != 1 {
			t.Errorf("Ada servedCount = %d, want 1", adaServed)
		}
	})

	t.Run("well-formed but unknown pickerId yields 422", func(t *testing.T) {
		code, _ := post(t, seededGroup, `{"pickerId":"a0000000-0000-0000-0000-0000000000ff","scheduledFor":"2026-06-02"}`)
		if code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want 422", code)
		}
	})

	t.Run("malformed pickerId yields 400", func(t *testing.T) {
		code, _ := post(t, seededGroup, `{"pickerId":"not-a-uuid","scheduledFor":"2026-06-02"}`)
		if code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", code)
		}
	})

	t.Run("malformed JSON yields 400", func(t *testing.T) {
		code, _ := post(t, seededGroup, `{not json`)
		if code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", code)
		}
	})

	t.Run("malformed groupId yields 400", func(t *testing.T) {
		code, _ := post(t, "not-a-uuid", `{"pickerId":"`+ada+`","scheduledFor":"2026-06-02"}`)
		if code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", code)
		}
	})
}
