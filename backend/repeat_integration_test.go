//go:build integration

package main

import (
	"context"
	"encoding/json"
	"net/http"
	"slices"
	"testing"
	"time"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// A repeating Night (ADR-0014): the rule rides on one Night, and recording or
// cancelling it opens the next.
func TestRepeatingNightsIntegration(t *testing.T) {
	pool := freshDB(t)
	seedFixtures(t, pool)

	upstream := fakeTMDB(t)
	client := &tmdbClient{baseURL: upstream.URL, token: "test", client: upstream.Client()}

	mux := http.NewServeMux()
	q := db.New(pool)
	mux.Handle("POST /groups/{groupId}/nights", createNightHandler(pool))
	mux.Handle("GET /groups/{groupId}/nights", listNightsHandler(q))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}", nightDetailHandler(q))
	mux.Handle("PATCH /groups/{groupId}/nights/{nightId}", updateNightHandler(pool))
	mux.Handle("DELETE /groups/{groupId}/nights/{nightId}", deleteNightHandler(pool))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/movie", recordNightMovieHandler(q, client))

	nightsPath := "/groups/" + seededGroup + "/nights"
	weekly := &repeatDTO{Freq: "weekly", IntervalWeeks: i16(1)}
	utcDay := func(days int) string { return time.Now().UTC().AddDate(0, 0, days).Format(dateLayout) }

	// mkNight creates a Night on date with Ada picking and Blake and Cleo
	// coming, starting at 20:00, with the given repeat.
	mkNight := func(t *testing.T, date string, repeat *repeatDTO) nightResponse {
		t.Helper()
		body, err := json.Marshal(createNightRequest{
			ScheduledFor: date, StartTime: str("20:00"), Attendees: []string{ada, blake, cleo}, PickerID: ada, Repeat: repeat,
		})
		if err != nil {
			t.Fatal(err)
		}
		code, n := doJSON[nightResponse](t, mux, http.MethodPost, nightsPath, string(body))
		if code != http.StatusCreated {
			t.Fatalf("create night on %s = %d", date, code)
		}
		return n
	}
	// mkFilmNight is mkNight today (UTC) with a film, so it can be recorded,
	// and reminders that differ from the defaults.
	mkFilmNight := func(t *testing.T, repeat *repeatDTO) nightResponse {
		t.Helper()
		clearAllPicks(t, pool, seededGroup)
		n := mkNight(t, utcDay(0), repeat)
		if code, _ := attachMovie(t, mux, seededGroup, n.ID, `{"tmdbId":438631}`); code != http.StatusOK {
			t.Fatalf("attach status = %d", code)
		}
		code, n := doJSON[nightResponse](t, mux, http.MethodPatch, nightsPath+"/"+n.ID, editBody(t, n, func(r *updateNightRequest) {
			r.Reminders = remindersDTO{NightBefore: false, MorningOf: true, TwoHoursBefore: true, Audience: "picker"}
		}))
		if code != http.StatusOK {
			t.Fatalf("set reminders = %d", code)
		}
		return n
	}
	record := func(t *testing.T, n nightResponse) nightResponse {
		t.Helper()
		code, got := doJSON[nightResponse](t, mux, http.MethodPatch, nightsPath+"/"+n.ID, editBody(t, n, func(r *updateNightRequest) { r.Watched = true }))
		if code != http.StatusOK || got.WatchedAt == nil {
			t.Fatalf("record = %d, watchedAt %v", code, got.WatchedAt)
		}
		return got
	}
	nightOn := func(t *testing.T, date string) *nightResponse {
		t.Helper()
		_, all := doJSON[[]nightResponse](t, mux, http.MethodGet, nightsPath, "")
		for _, n := range all {
			if n.ScheduledFor == date {
				return &n
			}
		}
		return nil
	}
	sameRepeat := func(a, b *repeatDTO) bool {
		ja, _ := json.Marshal(a)
		jb, _ := json.Marshal(b)
		return string(ja) == string(jb)
	}

	t.Run("create, edit and clear a repeat", func(t *testing.T) {
		clearAllPicks(t, pool, seededGroup)
		n := mkNight(t, "2026-06-19", weekly)
		if !sameRepeat(n.Repeat, weekly) {
			t.Fatalf("created repeat = %+v, want weekly", n.Repeat)
		}
		third := &repeatDTO{Freq: "monthly", Week: i16(3)}
		_, got := doJSON[nightResponse](t, mux, http.MethodPatch, nightsPath+"/"+n.ID, editBody(t, n, func(r *updateNightRequest) { r.Repeat = third }))
		if !sameRepeat(got.Repeat, third) {
			t.Fatalf("edited repeat = %+v, want third week monthly", got.Repeat)
		}
		_, got = doJSON[nightResponse](t, mux, http.MethodPatch, nightsPath+"/"+n.ID, editBody(t, got, func(r *updateNightRequest) { r.Repeat = nil }))
		if got.Repeat != nil {
			t.Fatalf("cleared repeat = %+v, want null", got.Repeat)
		}
	})

	t.Run("a repeat that doesn't match the date yields 400", func(t *testing.T) {
		clearAllPicks(t, pool, seededGroup)
		n := mkNight(t, "2026-06-19", nil)
		code, _ := doReq(t, mux, http.MethodPatch, nightsPath+"/"+n.ID, editBody(t, n, func(r *updateNightRequest) {
			r.Repeat = &repeatDTO{Freq: "monthly", Week: i16(1)}
		}))
		if code != http.StatusBadRequest {
			t.Fatalf("patch = %d, want 400", code)
		}
	})

	t.Run("recording a repeating night opens the next with the next picker", func(t *testing.T) {
		n := mkFilmNight(t, weekly)
		got := record(t, n)
		if got.Repeat != nil {
			t.Errorf("recorded night repeat = %+v, want null: the series moved on", got.Repeat)
		}
		next := nightOn(t, utcDay(7))
		if next == nil {
			t.Fatalf("no night on %s", utcDay(7))
		}
		// Ada's pick is credited, so Blake (rotation 2) leads Cleo (3).
		if next.PickerID != blake {
			t.Errorf("next picker = %s, want Blake", next.PickerID)
		}
		if !slices.Equal(attendeeIDs(*next), []string{ada, blake, cleo}) {
			t.Errorf("next attendees = %v, want Ada, Blake, Cleo", attendeeIDs(*next))
		}
		if !equalPtr(next.StartTime, "20:00") || next.Reminders != n.Reminders {
			t.Errorf("next start %v reminders %+v, want 20:00 and %+v", next.StartTime, next.Reminders, n.Reminders)
		}
		if !sameRepeat(next.Repeat, weekly) || next.Movie != nil || next.WatchedAt != nil {
			t.Errorf("next = %+v, want weekly, no film, not watched", next)
		}
	})

	t.Run("recording a one-off night opens nothing", func(t *testing.T) {
		n := mkFilmNight(t, nil)
		record(t, n)
		if _, all := doJSON[[]nightResponse](t, mux, http.MethodGet, nightsPath, ""); len(all) != 1 {
			t.Fatalf("nights = %d, want 1", len(all))
		}
	})

	t.Run("a taken next date joins the series", func(t *testing.T) {
		n := mkFilmNight(t, weekly)
		if code, _ := doReq(t, mux, http.MethodPost, nightsPath, nightBody(utcDay(7), cleo)); code != http.StatusCreated {
			t.Fatalf("create the later night = %d", code)
		}
		record(t, n)
		next := nightOn(t, utcDay(7))
		if next == nil || next.PickerID != cleo || !slices.Equal(attendeeIDs(*next), []string{cleo}) {
			t.Fatalf("night on %s = %+v, want Cleo's night kept as it was", utcDay(7), next)
		}
		if !sameRepeat(next.Repeat, weekly) {
			t.Fatalf("joined repeat = %+v, want weekly", next.Repeat)
		}
		if _, all := doJSON[[]nightResponse](t, mux, http.MethodGet, nightsPath, ""); len(all) != 2 {
			t.Fatalf("nights = %d, want 2", len(all))
		}
	})

	t.Run("a watched night on the next date is passed over", func(t *testing.T) {
		n := mkFilmNight(t, weekly)
		later := mkNight(t, utcDay(7), nil)
		if _, err := pool.Exec(context.Background(), "UPDATE nights SET watched_at = now() WHERE id = $1", later.ID); err != nil {
			t.Fatalf("record the later night: %v", err)
		}
		record(t, n)
		if got := nightOn(t, utcDay(7)); got == nil || got.Repeat != nil {
			t.Fatalf("watched night on %s = %+v, want it kept without a repeat", utcDay(7), got)
		}
		next := nightOn(t, utcDay(14))
		if next == nil || !sameRepeat(next.Repeat, weekly) {
			t.Fatalf("night on %s = %+v, want the series there", utcDay(14), next)
		}
	})

	t.Run("a series with no one in the rotation keeps its picker", func(t *testing.T) {
		clearAllPicks(t, pool, seededGroup)
		body, err := json.Marshal(createNightRequest{ScheduledFor: utcDay(0), Attendees: []string{frankie}, PickerID: frankie, Repeat: weekly})
		if err != nil {
			t.Fatal(err)
		}
		code, n := doJSON[nightResponse](t, mux, http.MethodPost, nightsPath, string(body))
		if code != http.StatusCreated {
			t.Fatalf("create guest night = %d", code)
		}
		if code, _ := attachMovie(t, mux, seededGroup, n.ID, `{"tmdbId":438631}`); code != http.StatusOK {
			t.Fatalf("attach status = %d", code)
		}
		_, n = doJSON[nightResponse](t, mux, http.MethodGet, nightsPath+"/"+n.ID, "")
		record(t, n)
		next := nightOn(t, utcDay(7))
		if next == nil || next.PickerID != frankie || !slices.Equal(attendeeIDs(*next), []string{frankie}) {
			t.Fatalf("next = %+v, want Frankie picking again, alone", next)
		}
	})

	t.Run("cancelling a repeating night moves the series on with the same picker", func(t *testing.T) {
		clearAllPicks(t, pool, seededGroup)
		n := mkNight(t, "2026-06-19", weekly)
		if code, _ := doReq(t, mux, http.MethodDelete, nightsPath+"/"+n.ID, ""); code != http.StatusNoContent {
			t.Fatalf("delete = %d, want 204", code)
		}
		next := nightOn(t, nextSeriesDate(repeatRule{Freq: repeatWeekly, IntervalWeeks: 1}, mustDate(t, "2026-06-19"), time.Now()).Format(dateLayout))
		if next == nil {
			t.Fatal("no next night after cancelling")
		}
		// With the cancelled pick gone, Ada leads again: she keeps her turn.
		if next.PickerID != ada || !sameRepeat(next.Repeat, weekly) || !equalPtr(next.StartTime, "20:00") {
			t.Fatalf("next = %+v, want Ada picking, weekly, 20:00", next)
		}
		if _, all := doJSON[[]nightResponse](t, mux, http.MethodGet, nightsPath, ""); len(all) != 1 {
			t.Fatalf("nights = %d, want 1", len(all))
		}
	})

	t.Run("cancelling a one-off night opens nothing", func(t *testing.T) {
		clearAllPicks(t, pool, seededGroup)
		n := mkNight(t, "2026-06-19", nil)
		if code, _ := doReq(t, mux, http.MethodDelete, nightsPath+"/"+n.ID, ""); code != http.StatusNoContent {
			t.Fatalf("delete = %d, want 204", code)
		}
		if _, all := doJSON[[]nightResponse](t, mux, http.MethodGet, nightsPath, ""); len(all) != 0 {
			t.Fatalf("nights = %d, want 0", len(all))
		}
	})

	t.Run("a watched night can't be set to repeat", func(t *testing.T) {
		got := record(t, mkFilmNight(t, nil))
		code, _ := doReq(t, mux, http.MethodPatch, nightsPath+"/"+got.ID, editBody(t, got, func(r *updateNightRequest) { r.Repeat = weekly }))
		if code != http.StatusUnprocessableEntity {
			t.Fatalf("patch = %d, want 422", code)
		}
	})
}
