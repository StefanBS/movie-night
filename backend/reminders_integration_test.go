//go:build integration

package main

import (
	"encoding/json"
	"maps"
	"net/http"
	"net/http/httptest"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// fakeExpo is a local stand-in for Expo's push service: it records every
// message and answers DeviceNotRegistered for the tokens in dead.
func fakeExpo(t *testing.T, dead ...string) (*expoPusher, func() []pushMessage) {
	t.Helper()
	var mu sync.Mutex
	var got []pushMessage
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var batch []pushMessage
		if err := json.NewDecoder(r.Body).Decode(&batch); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		mu.Lock()
		got = append(got, batch...)
		mu.Unlock()
		tickets := make([]map[string]any, 0, len(batch))
		for _, m := range batch {
			if slices.Contains(dead, m.To) {
				tickets = append(tickets, map[string]any{"status": "error", "message": "gone", "details": map[string]string{"error": "DeviceNotRegistered"}})
				continue
			}
			tickets = append(tickets, map[string]any{"status": "ok", "id": "r"})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": tickets})
	}))
	t.Cleanup(srv.Close)
	pusher := &expoPusher{url: srv.URL, client: srv.Client()}
	return pusher, func() []pushMessage {
		mu.Lock()
		defer mu.Unlock()
		out := got
		got = nil
		return out
	}
}

func TestRemindersIntegration(t *testing.T) {
	pool := freshDB(t)
	seedFixtures(t, pool)
	q := db.New(pool)

	mux := http.NewServeMux()
	mux.Handle("POST /groups/{groupId}/nights", createNightHandler(pool))
	mux.Handle("PATCH /groups/{groupId}/nights/{nightId}", updateNightHandler(pool))

	// device registers a push-ready device for a person, in Madrid.
	device := func(t *testing.T, user, pushToken string) {
		t.Helper()
		if _, err := pool.Exec(t.Context(),
			`INSERT INTO devices (user_id, token_hash, push_token, time_zone) VALUES ($1, $2, $3, 'Europe/Madrid')`,
			user, hashToken(pushToken), pushToken); err != nil {
			t.Fatalf("insert device: %v", err)
		}
	}
	reset := func(t *testing.T) nightResponse {
		t.Helper()
		clearAllPicks(t, pool, seededGroup)
		if _, err := pool.Exec(t.Context(), `DELETE FROM devices`); err != nil {
			t.Fatalf("clear devices: %v", err)
		}
		if _, err := pool.Exec(t.Context(), `UPDATE users SET reminders_muted = false`); err != nil {
			t.Fatalf("unmute: %v", err)
		}
		// Ada picks; Blake, Frankie (guest) and Zed (inactive) are coming.
		code, n := doJSON[nightResponse](t, mux, http.MethodPost, "/groups/"+seededGroup+"/nights",
			nightBody("2026-06-19", ada, blake, frankie, zed))
		if code != http.StatusCreated {
			t.Fatalf("create night = %d", code)
		}
		return n
	}
	byToken := func(msgs []pushMessage) map[string]pushMessage {
		out := make(map[string]pushMessage, len(msgs))
		for _, m := range msgs {
			out[m.To] = m
		}
		return out
	}
	nightBefore := time.Date(2026, 6, 18, 16, 1, 0, 0, time.UTC) // 18:01 in Madrid
	morningOf := time.Date(2026, 6, 19, 7, 1, 0, 0, time.UTC)    // 09:01 in Madrid

	t.Run("the night before: the picker's nudge and everyone's reminder, once", func(t *testing.T) {
		n := reset(t)
		device(t, ada, "ExponentPushToken[ada]")
		device(t, blake, "ExponentPushToken[blake]")
		device(t, frankie, "ExponentPushToken[frankie]")
		device(t, zed, "ExponentPushToken[zed]")
		push, sent := fakeExpo(t)

		if err := sendDueReminders(t.Context(), q, push, nightBefore); err != nil {
			t.Fatalf("send: %v", err)
		}
		got := byToken(sent())
		if len(got) != 3 {
			t.Fatalf("sent to %v, want Ada, Blake and Frankie (not inactive Zed)", slices.Sorted(maps.Keys(got)))
		}
		if m := got["ExponentPushToken[ada]"]; m.Title != "✦ It's your turn — you pick tomorrow's movie" {
			t.Errorf("Ada's title = %q", m.Title)
		}
		if m := got["ExponentPushToken[blake]"]; m.Title != "Movie night is on for tomorrow" ||
			m.Body != "Ada picks · 4 going. Tap to see who's coming." {
			t.Errorf("Blake's message = %+v", m)
		}
		if m := got["ExponentPushToken[frankie]"]; m.Data["nightId"] != n.ID || m.ChannelID != "reminders" {
			t.Errorf("Frankie's message = %+v", m)
		}

		if err := sendDueReminders(t.Context(), q, push, nightBefore.Add(time.Minute)); err != nil {
			t.Fatalf("second send: %v", err)
		}
		if again := sent(); len(again) != 0 {
			t.Errorf("resent %d reminders, want none", len(again))
		}
	})

	t.Run("just the picker with every slot off: only the nudge", func(t *testing.T) {
		n := reset(t)
		device(t, ada, "ExponentPushToken[ada]")
		device(t, blake, "ExponentPushToken[blake]")
		if code, _ := doReq(t, mux, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) { r.Reminders = remindersDTO{Audience: "picker"} })); code != http.StatusOK {
			t.Fatalf("patch = %d", code)
		}
		push, sent := fakeExpo(t)
		for _, now := range []time.Time{nightBefore, morningOf} {
			if err := sendDueReminders(t.Context(), q, push, now); err != nil {
				t.Fatalf("send: %v", err)
			}
		}
		got := sent()
		if len(got) != 1 || got[0].To != "ExponentPushToken[ada]" {
			t.Fatalf("sent %+v, want only Ada's nudge", got)
		}
	})

	t.Run("a muted person gets nothing", func(t *testing.T) {
		reset(t)
		device(t, blake, "ExponentPushToken[blake]")
		if _, err := pool.Exec(t.Context(), `UPDATE users SET reminders_muted = true WHERE id = $1`, blake); err != nil {
			t.Fatalf("mute: %v", err)
		}
		push, sent := fakeExpo(t)
		if err := sendDueReminders(t.Context(), q, push, morningOf); err != nil {
			t.Fatalf("send: %v", err)
		}
		if got := sent(); len(got) != 0 {
			t.Errorf("sent %+v to a muted person", got)
		}
	})

	t.Run("a token Expo no longer knows is cleared", func(t *testing.T) {
		reset(t)
		device(t, blake, "ExponentPushToken[gone]")
		push, _ := fakeExpo(t, "ExponentPushToken[gone]")
		if err := sendDueReminders(t.Context(), q, push, morningOf); err != nil {
			t.Fatalf("send: %v", err)
		}
		var left *string
		if err := pool.QueryRow(t.Context(), `SELECT push_token FROM devices WHERE user_id = $1`, blake).Scan(&left); err != nil {
			t.Fatalf("read device: %v", err)
		}
		if left != nil {
			t.Errorf("push token = %q, want cleared", *left)
		}
	})

	t.Run("2 hours before a Night's start time, once", func(t *testing.T) {
		n := reset(t)
		device(t, blake, "ExponentPushToken[blake]")
		if code, _ := doReq(t, mux, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID, editBody(t, n, func(r *updateNightRequest) { r.StartTime = str("21:00") })); code != http.StatusOK {
			t.Fatalf("set start time = %d", code)
		}
		push, sent := fakeExpo(t)
		twoHoursBefore := time.Date(2026, 6, 19, 17, 1, 0, 0, time.UTC) // 19:01 in Madrid

		if err := sendDueReminders(t.Context(), q, push, twoHoursBefore); err != nil {
			t.Fatalf("send: %v", err)
		}
		got := sent()
		if len(got) != 1 || got[0].Title != "Movie night starts at 9:00 PM" {
			t.Fatalf("sent %+v, want Blake's 2-hours-before reminder", got)
		}
		if err := sendDueReminders(t.Context(), q, push, twoHoursBefore.Add(time.Minute)); err != nil {
			t.Fatalf("second send: %v", err)
		}
		if again := sent(); len(again) != 0 {
			t.Errorf("resent %d reminders, want none", len(again))
		}
	})
}
