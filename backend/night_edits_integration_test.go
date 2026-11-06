//go:build integration

package main

import (
	"context"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestNightEditsIntegration(t *testing.T) {
	pool := freshDB(t)
	seedFixtures(t, pool)

	upstream := fakeTMDB(t)
	client := &tmdbClient{baseURL: upstream.URL, token: "test", client: upstream.Client()}

	mux := http.NewServeMux()
	q := db.New(pool)
	mux.Handle("POST /groups/{groupId}/nights", createNightHandler(pool))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}", nightDetailHandler(q))
	mux.Handle("PATCH /groups/{groupId}/nights/{nightId}", updateNightHandler(pool))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/pick", recordNightPickHandler(pool))
	mux.Handle("DELETE /groups/{groupId}/nights/{nightId}", deleteNightHandler(pool))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/movie", recordNightMovieHandler(pool, client))
	mux.Handle("DELETE /groups/{groupId}/nights/{nightId}/movie", clearNightMovieHandler(pool))
	mux.Handle("GET /groups/{groupId}/turn", turnHandler(q))

	do := func(t *testing.T, method, path, body string) (int, []byte) {
		t.Helper()
		return doReq(t, mux, method, path, body)
	}

	mkNight := func(t *testing.T) nightResponse {
		t.Helper()
		clearAllPicks(t, pool, seededGroup)
		code, n := doJSON[nightResponse](t, mux, http.MethodPost, "/groups/"+seededGroup+"/nights", nightBody("2026-06-12", ada))
		if code != http.StatusCreated {
			t.Fatalf("create night = %d", code)
		}
		return n
	}

	t.Run("PATCH changes scheduledFor", func(t *testing.T) {
		n := mkNight(t)
		code, got := doJSON[nightResponse](t, mux, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) { r.ScheduledFor = "2026-07-04" }))
		if code != http.StatusOK {
			t.Fatalf("patch status = %d, want 200", code)
		}
		if got.ScheduledFor != "2026-07-04" {
			t.Fatalf("scheduledFor = %q, want 2026-07-04", got.ScheduledFor)
		}
	})

	t.Run("PATCH onto another night's date yields 409", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", nightBody("2026-07-04", blake)); code != http.StatusCreated {
			t.Fatalf("create second night = %d, want 201", code)
		}
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID, editBody(t, n, func(r *updateNightRequest) { r.ScheduledFor = "2026-07-04" })); code != http.StatusConflict {
			t.Fatalf("patch status = %d, want 409", code)
		}
	})

	t.Run("PATCH bad date yields 400", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID, editBody(t, n, func(r *updateNightRequest) { r.ScheduledFor = "nope" })); code != http.StatusBadRequest {
			t.Fatalf("bad date status = %d, want 400", code)
		}
	})

	t.Run("PATCH attendees replaces the set", func(t *testing.T) {
		n := mkNight(t) // Ada picks, alone
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID, editBody(t, n, func(r *updateNightRequest) { r.Attendees = []string{ada, frankie} })); code != http.StatusOK {
			t.Fatalf("add guest status = %d, want 200", code)
		}
		code, got := doJSON[nightResponse](t, mux, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) { r.Attendees = []string{ada, blake} }))
		if code != http.StatusOK {
			t.Fatalf("patch status = %d, want 200", code)
		}
		if ids := attendeeIDs(got); !slices.Equal(ids, []string{ada, blake}) {
			t.Fatalf("attendees = %v, want [Ada Blake] (guest Frankie removed)", ids)
		}
		if got.ScheduledFor != "2026-06-12" || got.PickerID != ada {
			t.Fatalf("night = %+v, want date and picker unchanged", got)
		}
	})

	// unchanged asserts a rejected PATCH left the stored Night exactly as before.
	unchanged := func(t *testing.T, before nightResponse) {
		t.Helper()
		_, after := doJSON[nightResponse](t, mux, http.MethodGet, "/groups/"+seededGroup+"/nights/"+before.ID, "")
		if after.ScheduledFor != before.ScheduledFor || after.PickerID != before.PickerID ||
			!slices.Equal(attendeeIDs(after), attendeeIDs(before)) || after.Reminders != before.Reminders ||
			!equalPtr(after.StartTime, deref(before.StartTime)) || !equalPtr(after.WatchedAt, deref(before.WatchedAt)) {
			t.Fatalf("night after rejected edit = %+v, want unchanged %+v", after, before)
		}
	}

	t.Run("a new night has the default reminders", func(t *testing.T) {
		n := mkNight(t)
		want := remindersDTO{NightBefore: true, MorningOf: true, TwoHoursBefore: true, Audience: "everyone"}
		if n.Reminders != want {
			t.Fatalf("reminders = %+v, want %+v", n.Reminders, want)
		}
	})

	t.Run("PATCH replaces the reminders", func(t *testing.T) {
		n := mkNight(t)
		code, got := doJSON[nightResponse](t, mux, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) {
				r.Reminders = remindersDTO{NightBefore: false, MorningOf: true, TwoHoursBefore: false, Audience: "picker"}
			}))
		if code != http.StatusOK {
			t.Fatalf("patch status = %d, want 200", code)
		}
		want := remindersDTO{NightBefore: false, MorningOf: true, TwoHoursBefore: false, Audience: "picker"}
		if got.Reminders != want {
			t.Fatalf("reminders = %+v, want %+v", got.Reminders, want)
		}
		if _, read := doJSON[nightResponse](t, mux, http.MethodGet, "/groups/"+seededGroup+"/nights/"+n.ID, ""); read.Reminders != want {
			t.Fatalf("stored reminders = %+v, want %+v", read.Reminders, want)
		}
	})

	t.Run("a new night has no start time", func(t *testing.T) {
		if n := mkNight(t); n.StartTime != nil {
			t.Fatalf("startTime = %q, want null", *n.StartTime)
		}
	})

	t.Run("a night created with a start time keeps it", func(t *testing.T) {
		clearAllPicks(t, pool, seededGroup)
		code, n := doJSON[nightResponse](t, mux, http.MethodPost, "/groups/"+seededGroup+"/nights",
			`{"scheduledFor":"2026-06-12","startTime":"19:30","pickerId":"`+ada+`","attendees":["`+ada+`"]}`)
		if code != http.StatusCreated || !equalPtr(n.StartTime, "19:30") {
			t.Fatalf("create = %d, startTime %v; want 201, 19:30", code, n.StartTime)
		}
		if _, read := doJSON[nightResponse](t, mux, http.MethodGet, "/groups/"+seededGroup+"/nights/"+n.ID, ""); !equalPtr(read.StartTime, "19:30") {
			t.Fatalf("stored startTime = %v, want 19:30", read.StartTime)
		}
	})

	t.Run("a bad start time on create yields 400", func(t *testing.T) {
		clearAllPicks(t, pool, seededGroup)
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights",
			`{"scheduledFor":"2026-06-12","startTime":"7pm","pickerId":"`+ada+`","attendees":["`+ada+`"]}`); code != http.StatusBadRequest {
			t.Fatalf("create status = %d, want 400", code)
		}
	})

	t.Run("PATCH sets, keeps and clears the start time", func(t *testing.T) {
		n := mkNight(t)
		path := "/groups/" + seededGroup + "/nights/" + n.ID
		code, n := doJSON[nightResponse](t, mux, http.MethodPatch, path, editBody(t, n, func(r *updateNightRequest) { r.StartTime = str("20:15") }))
		if code != http.StatusOK || !equalPtr(n.StartTime, "20:15") {
			t.Fatalf("set = %d, startTime %v; want 200, 20:15", code, n.StartTime)
		}
		if _, n = doJSON[nightResponse](t, mux, http.MethodPatch, path, editBody(t, n, func(r *updateNightRequest) { r.ScheduledFor = "2026-06-13" })); !equalPtr(n.StartTime, "20:15") {
			t.Fatalf("after a date-only edit startTime = %v, want 20:15 kept", n.StartTime)
		}
		if _, got := doJSON[nightResponse](t, mux, http.MethodPatch, path, editBody(t, n, func(r *updateNightRequest) { r.StartTime = nil })); got.StartTime != nil {
			t.Fatalf("after clearing startTime = %q, want null", *got.StartTime)
		}
		if _, read := doJSON[nightResponse](t, mux, http.MethodGet, path, ""); read.StartTime != nil {
			t.Fatalf("stored startTime = %q, want null", *read.StartTime)
		}
	})

	t.Run("PATCH onto a taken date with a new start time changes nothing", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", nightBody("2026-07-04", blake)); code != http.StatusCreated {
			t.Fatalf("create second night = %d, want 201", code)
		}
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID, editBody(t, n, func(r *updateNightRequest) {
			r.ScheduledFor, r.StartTime = "2026-07-04", str("21:00")
		})); code != http.StatusConflict {
			t.Fatalf("patch status = %d, want 409", code)
		}
		unchanged(t, n)
	})

	t.Run("PATCH without reminders yields 400 (the body is the whole Night)", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID, `{"scheduledFor":"2026-06-12","attendees":["`+ada+`"]}`); code != http.StatusBadRequest {
			t.Fatalf("patch status = %d, want 400", code)
		}
	})

	t.Run("PATCH onto a taken date with new reminders changes nothing", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", nightBody("2026-07-04", blake)); code != http.StatusCreated {
			t.Fatalf("create second night = %d, want 201", code)
		}
		code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) {
				r.ScheduledFor, r.Reminders = "2026-07-04", remindersDTO{Audience: "picker"}
			}))
		if code != http.StatusConflict {
			t.Fatalf("patch status = %d, want 409", code)
		}
		unchanged(t, n)
	})

	t.Run("PATCH onto a taken date with new attendees changes nothing", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", nightBody("2026-07-04", blake)); code != http.StatusCreated {
			t.Fatalf("create second night = %d, want 201", code)
		}
		// The attendee change is valid on its own; only the date fails, last.
		code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) { r.ScheduledFor, r.Attendees = "2026-07-04", []string{ada, cleo} }))
		if code != http.StatusConflict {
			t.Fatalf("patch status = %d, want 409", code)
		}
		unchanged(t, n)
	})

	t.Run("PATCH with a non-member attendee yields 422 and changes nothing", func(t *testing.T) {
		n := mkNight(t)
		code, body := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) { r.ScheduledFor, r.Attendees = "2026-07-04", []string{ada, unknownUser} }))
		if code != http.StatusUnprocessableEntity {
			t.Fatalf("patch status = %d, want 422", code)
		}
		if !strings.Contains(string(body), unknownUser) {
			t.Fatalf("body = %s, want it to name %s", body, unknownUser)
		}
		unchanged(t, n)
	})

	t.Run("PATCH dropping the picker yields 422 and changes nothing", func(t *testing.T) {
		clearAllPicks(t, pool, seededGroup)
		_, n := doJSON[nightResponse](t, mux, http.MethodPost, "/groups/"+seededGroup+"/nights", nightBody("2026-06-12", ada, blake))
		code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) { r.ScheduledFor, r.Attendees = "2026-07-04", []string{blake} }))
		if code != http.StatusUnprocessableEntity {
			t.Fatalf("patch status = %d, want 422", code)
		}
		unchanged(t, n)
	})

	t.Run("PATCH with no attendees yields 422 (the picker is always one)", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID, editBody(t, n, func(r *updateNightRequest) { r.Attendees = []string{} })); code != http.StatusUnprocessableEntity {
			t.Fatalf("patch status = %d, want 422", code)
		}
		unchanged(t, n)
	})

	t.Run("PATCH an unknown night yields 404", func(t *testing.T) {
		n := mkNight(t)
		body := editBody(t, n, func(r *updateNightRequest) { r.Attendees = []string{unknownUser} })
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+unknownNight, body); code != http.StatusNotFound {
			t.Fatalf("patch status = %d, want 404 (before the 422)", code)
		}
	})

	t.Run("PATCH with an empty body yields 400", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID, `{}`); code != http.StatusBadRequest {
			t.Fatalf("patch status = %d, want 400", code)
		}
	})

	t.Run("PATCH date and attendees together applies both", func(t *testing.T) {
		n := mkNight(t)
		code, got := doJSON[nightResponse](t, mux, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) { r.ScheduledFor, r.Attendees = "2026-07-04", []string{cleo, ada} }))
		if code != http.StatusOK {
			t.Fatalf("patch status = %d, want 200", code)
		}
		if got.ScheduledFor != "2026-07-04" || !slices.Equal(attendeeIDs(got), []string{ada, cleo}) {
			t.Fatalf("night = %+v, want 2026-07-04 with [Ada Cleo]", got)
		}
	})

	// Every night response reads the movie through its own query's LEFT JOIN, so
	// each write path is checked to carry an attached film through.
	t.Run("an attached movie comes back from every night response", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := attachMovie(t, mux, seededGroup, n.ID, `{"tmdbId":438631}`); code != http.StatusOK {
			t.Fatalf("attach status = %d, want 200", code)
		}
		base := "/groups/" + seededGroup + "/nights/" + n.ID
		for _, step := range []struct{ name, method, path, body string }{
			{"detail", http.MethodGet, base, ""},
			{"edit attendees", http.MethodPatch, base, editBody(t, n, func(r *updateNightRequest) { r.Attendees = []string{ada, blake} })},
			{"edit date", http.MethodPatch, base, editBody(t, n, func(r *updateNightRequest) { r.ScheduledFor, r.Attendees = "2026-07-04", []string{ada, blake} })},
			{"record pick", http.MethodPost, base + "/pick", `{"pickerId":"` + blake + `"}`},
		} {
			code, got := doJSON[nightResponse](t, mux, step.method, step.path, step.body)
			if code != http.StatusOK {
				t.Fatalf("%s status = %d, want 200", step.name, code)
			}
			if got.Movie == nil || got.Movie.TMDBID != 438631 || got.Movie.Title != "Dune" ||
				got.Movie.ReleaseYear == nil || *got.Movie.ReleaseYear != 2021 || got.Movie.PosterURL == nil {
				t.Fatalf("%s movie = %+v, want Dune (2021) with a poster", step.name, got.Movie)
			}
		}
	})

	// Recording a Night (ADR-0012): "We watched it" confirms who came and who
	// picked, and records the Night, in one PATCH.
	t.Run("a new night is not watched", func(t *testing.T) {
		if n := mkNight(t); n.WatchedAt != nil {
			t.Fatalf("watchedAt = %q, want null", *n.WatchedAt)
		}
	})

	t.Run("PATCH watched records the night with its attendees and picker", func(t *testing.T) {
		n := mkNight(t) // Ada picks, alone
		if code, _ := attachMovie(t, mux, seededGroup, n.ID, `{"tmdbId":438631}`); code != http.StatusOK {
			t.Fatalf("attach status = %d, want 200", code)
		}
		code, got := doJSON[nightResponse](t, mux, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) {
				r.Attendees, r.PickerID, r.Watched = []string{blake, cleo}, str(blake), true
			}))
		if code != http.StatusOK {
			t.Fatalf("patch status = %d, want 200", code)
		}
		if got.WatchedAt == nil {
			t.Fatal("watchedAt = null, want set")
		}
		if got.PickerID != blake || !slices.Equal(attendeeIDs(got), []string{blake, cleo}) {
			t.Fatalf("night = %+v, want Blake picking with [Blake Cleo]", got)
		}
		if _, read := doJSON[nightResponse](t, mux, http.MethodGet, "/groups/"+seededGroup+"/nights/"+n.ID, ""); !equalPtr(read.WatchedAt, *got.WatchedAt) {
			t.Fatalf("stored watchedAt = %v, want %q", read.WatchedAt, *got.WatchedAt)
		}
	})

	t.Run("PATCH watched without a film yields 422 and changes nothing", func(t *testing.T) {
		n := mkNight(t)
		code, body := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) {
				r.Attendees, r.PickerID, r.Watched = []string{blake, cleo}, str(blake), true
			}))
		if code != http.StatusUnprocessableEntity {
			t.Fatalf("patch status = %d, want 422 (body %s)", code, body)
		}
		unchanged(t, n)
	})

	t.Run("PATCH with a picker who isn't attending yields 422 and changes nothing", func(t *testing.T) {
		n := mkNight(t)
		code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) { r.Attendees, r.PickerID = []string{ada, cleo}, str(blake) }))
		if code != http.StatusUnprocessableEntity {
			t.Fatalf("patch status = %d, want 422", code)
		}
		unchanged(t, n)
	})

	t.Run("PATCH watched onto a taken date changes nothing", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := attachMovie(t, mux, seededGroup, n.ID, `{"tmdbId":438631}`); code != http.StatusOK {
			t.Fatalf("attach status = %d, want 200", code)
		}
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", nightBody("2026-07-04", blake)); code != http.StatusCreated {
			t.Fatalf("create second night = %d, want 201", code)
		}
		code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) {
				r.ScheduledFor, r.Attendees, r.PickerID, r.Watched = "2026-07-04", []string{ada, cleo}, str(cleo), true
			}))
		if code != http.StatusConflict {
			t.Fatalf("patch status = %d, want 409", code)
		}
		unchanged(t, n)
	})

	t.Run("recording twice keeps the first watchedAt", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := attachMovie(t, mux, seededGroup, n.ID, `{"tmdbId":438631}`); code != http.StatusOK {
			t.Fatalf("attach status = %d, want 200", code)
		}
		path := "/groups/" + seededGroup + "/nights/" + n.ID
		record := editBody(t, n, func(r *updateNightRequest) { r.Watched = true })
		_, first := doJSON[nightResponse](t, mux, http.MethodPatch, path, record)
		if first.WatchedAt == nil {
			t.Fatal("first watchedAt = null, want set")
		}
		// Push the stored time back, so a second recording that overwrote it
		// would be visible even within the same second.
		if _, err := pool.Exec(context.Background(), "UPDATE nights SET watched_at = watched_at - interval '1 day' WHERE id = $1", n.ID); err != nil {
			t.Fatalf("age watched_at: %v", err)
		}
		_, before := doJSON[nightResponse](t, mux, http.MethodGet, path, "")
		code, second := doJSON[nightResponse](t, mux, http.MethodPatch, path, record)
		if code != http.StatusOK {
			t.Fatalf("second record status = %d, want 200", code)
		}
		if !equalPtr(second.WatchedAt, deref(before.WatchedAt)) {
			t.Fatalf("watchedAt after recording again = %v, want %v kept", second.WatchedAt, before.WatchedAt)
		}
		// An edit without watched leaves the record alone; there is no un-recording.
		if _, edited := doJSON[nightResponse](t, mux, http.MethodPatch, path, editBody(t, second, func(*updateNightRequest) {})); !equalPtr(edited.WatchedAt, deref(before.WatchedAt)) {
			t.Fatalf("watchedAt after a plain edit = %v, want %v kept", edited.WatchedAt, before.WatchedAt)
		}
	})

	// A Night can be recorded up to the day after the server's UTC date
	// (ADR-0013): the latest date that is "today" in some zone (UTC+14).
	utcDay := func(days int) string { return time.Now().UTC().AddDate(0, 0, days).Format(dateLayout) }
	mkFilmNightOn := func(t *testing.T, date string) nightResponse {
		t.Helper()
		clearAllPicks(t, pool, seededGroup)
		code, n := doJSON[nightResponse](t, mux, http.MethodPost, "/groups/"+seededGroup+"/nights", nightBody(date, ada))
		if code != http.StatusCreated {
			t.Fatalf("create night on %s = %d", date, code)
		}
		if code, _ := attachMovie(t, mux, seededGroup, n.ID, `{"tmdbId":438631}`); code != http.StatusOK {
			t.Fatalf("attach status = %d, want 200", code)
		}
		_, n = doJSON[nightResponse](t, mux, http.MethodGet, "/groups/"+seededGroup+"/nights/"+n.ID, "")
		return n
	}

	t.Run("PATCH watched on a night dated today in UTC+14 records it", func(t *testing.T) {
		n := mkFilmNightOn(t, utcDay(1))
		code, got := doJSON[nightResponse](t, mux, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) { r.Watched = true }))
		if code != http.StatusOK || got.WatchedAt == nil {
			t.Fatalf("patch = %d, watchedAt %v; want 200 and recorded", code, got.WatchedAt)
		}
	})

	t.Run("PATCH watched on a night that hasn't happened yields 422 and changes nothing", func(t *testing.T) {
		n := mkFilmNightOn(t, utcDay(2))
		code, body := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) {
				r.Attendees, r.PickerID, r.Watched = []string{ada, blake}, str(blake), true
			}))
		if code != http.StatusUnprocessableEntity {
			t.Fatalf("patch status = %d, want 422 (body %s)", code, body)
		}
		unchanged(t, n)
	})

	t.Run("PATCH watched moving a night past the bound yields 422 and changes nothing", func(t *testing.T) {
		n := mkFilmNightOn(t, utcDay(0))
		code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) { r.ScheduledFor, r.Watched = utcDay(7), true }))
		if code != http.StatusUnprocessableEntity {
			t.Fatalf("patch status = %d, want 422", code)
		}
		unchanged(t, n)
	})

	t.Run("a watched night can't be moved past the bound", func(t *testing.T) {
		n := mkFilmNightOn(t, utcDay(-3))
		path := "/groups/" + seededGroup + "/nights/" + n.ID
		code, recorded := doJSON[nightResponse](t, mux, http.MethodPatch, path, editBody(t, n, func(r *updateNightRequest) { r.Watched = true }))
		if code != http.StatusOK {
			t.Fatalf("record status = %d, want 200", code)
		}
		if code, _ := do(t, http.MethodPatch, path, editBody(t, recorded, func(r *updateNightRequest) { r.ScheduledFor = utcDay(2) })); code != http.StatusUnprocessableEntity {
			t.Fatalf("move watched night ahead = %d, want 422", code)
		}
		unchanged(t, recorded)
		code, moved := doJSON[nightResponse](t, mux, http.MethodPatch, path, editBody(t, recorded, func(r *updateNightRequest) { r.ScheduledFor = utcDay(1) }))
		if code != http.StatusOK || moved.ScheduledFor != utcDay(1) || !equalPtr(moved.WatchedAt, deref(recorded.WatchedAt)) {
			t.Fatalf("move watched night within the bound = %d %+v, want 200, moved and still recorded", code, moved)
		}
	})

	t.Run("a night not yet watched can still be planned any distance ahead", func(t *testing.T) {
		n := mkFilmNightOn(t, utcDay(0))
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) { r.ScheduledFor = utcDay(30) })); code != http.StatusOK {
			t.Fatalf("patch status = %d, want 200", code)
		}
	})

	t.Run("recording a night leaves the turn order and served counts as they were", func(t *testing.T) {
		clearAllPicks(t, pool, seededGroup)
		_, n := doJSON[nightResponse](t, mux, http.MethodPost, "/groups/"+seededGroup+"/nights", nightBody("2026-06-12", ada, blake, cleo))
		if code, _ := attachMovie(t, mux, seededGroup, n.ID, `{"tmdbId":438631}`); code != http.StatusOK {
			t.Fatalf("attach status = %d, want 200", code)
		}
		_, before := doJSON[[]turnResponse](t, mux, http.MethodGet, "/groups/"+seededGroup+"/turn", "")
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) { r.PickerID, r.Watched = str(ada), true })); code != http.StatusOK {
			t.Fatalf("record status = %d, want 200", code)
		}
		_, after := doJSON[[]turnResponse](t, mux, http.MethodGet, "/groups/"+seededGroup+"/turn", "")
		if len(before) == 0 || !slices.EqualFunc(before, after, func(a, b turnResponse) bool {
			return a.ID == b.ID && a.ServedCount == b.ServedCount && equalPtr(a.LastPickedOn, deref(b.LastPickedOn))
		}) {
			t.Fatalf("turn after recording = %+v, want unchanged %+v", after, before)
		}
	})

	t.Run("DELETE movie on an unknown night yields 404", func(t *testing.T) {
		if code, _ := do(t, http.MethodDelete, "/groups/"+seededGroup+"/nights/"+unknownNight+"/movie", ""); code != http.StatusNotFound {
			t.Fatalf("clear status = %d, want 404", code)
		}
	})

	t.Run("DELETE movie detaches film", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := attachMovie(t, mux, seededGroup, n.ID, `{"tmdbId":438631}`); code != http.StatusOK {
			t.Fatalf("attach status = %d, want 200", code)
		}
		code, got := doJSON[nightResponse](t, mux, http.MethodDelete, "/groups/"+seededGroup+"/nights/"+n.ID+"/movie", "")
		if code != http.StatusOK {
			t.Fatalf("clear status = %d, want 200", code)
		}
		if got.Movie != nil {
			t.Fatalf("movie = %+v, want null", got.Movie)
		}
	})

	t.Run("DELETE movie is idempotent when no film", func(t *testing.T) {
		n := mkNight(t)
		code, got := doJSON[nightResponse](t, mux, http.MethodDelete, "/groups/"+seededGroup+"/nights/"+n.ID+"/movie", "")
		if code != http.StatusOK {
			t.Fatalf("clear status = %d, want 200", code)
		}
		if got.Movie != nil {
			t.Fatalf("movie = %+v, want null", got.Movie)
		}
	})

	// A Watched Night needs its film (the glossary's Film), so clearing it is
	// refused; correcting it to another film still works.
	mkWatched := func(t *testing.T) nightResponse {
		t.Helper()
		n := mkNight(t)
		if code, _ := attachMovie(t, mux, seededGroup, n.ID, `{"tmdbId":438631}`); code != http.StatusOK {
			t.Fatalf("attach status = %d, want 200", code)
		}
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			editBody(t, n, func(r *updateNightRequest) { r.Watched = true })); code != http.StatusOK {
			t.Fatalf("record status = %d, want 200", code)
		}
		return n
	}

	t.Run("DELETE movie on a Watched Night yields 422 and keeps the film", func(t *testing.T) {
		n := mkWatched(t)
		if code, _ := do(t, http.MethodDelete, "/groups/"+seededGroup+"/nights/"+n.ID+"/movie", ""); code != http.StatusUnprocessableEntity {
			t.Fatalf("clear status = %d, want 422", code)
		}
		_, got := doJSON[nightResponse](t, mux, http.MethodGet, "/groups/"+seededGroup+"/nights/"+n.ID, "")
		if got.Movie == nil || got.Movie.TMDBID != 438631 {
			t.Fatalf("movie = %+v, want Dune kept", got.Movie)
		}
	})

	t.Run("POST movie on a Watched Night changes its film", func(t *testing.T) {
		n := mkWatched(t)
		code, got := attachMovie(t, mux, seededGroup, n.ID, `{"tmdbId":841}`)
		if code != http.StatusOK {
			t.Fatalf("attach status = %d, want 200", code)
		}
		if got.Movie == nil || got.Movie.TMDBID != 841 || got.WatchedAt == nil {
			t.Fatalf("night = movie %+v watchedAt %v, want 841 and still watched", got.Movie, got.WatchedAt)
		}
	})

	t.Run("DELETE night removes it", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodDelete, "/groups/"+seededGroup+"/nights/"+n.ID, ""); code != http.StatusNoContent {
			t.Fatalf("delete status = %d, want 204", code)
		}
		if code, _ := do(t, http.MethodGet, "/groups/"+seededGroup+"/nights/"+n.ID, ""); code != http.StatusNotFound {
			t.Fatalf("get after delete = %d, want 404", code)
		}
	})

	t.Run("DELETE night is idempotent", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodDelete, "/groups/"+seededGroup+"/nights/"+n.ID, ""); code != http.StatusNoContent {
			t.Fatalf("first delete = %d, want 204", code)
		}
		if code, _ := do(t, http.MethodDelete, "/groups/"+seededGroup+"/nights/"+n.ID, ""); code != http.StatusNoContent {
			t.Fatalf("second delete = %d, want 204", code)
		}
	})
}

func attachMovie(t *testing.T, mux http.Handler, group, nightID, body string) (int, nightResponse) {
	t.Helper()
	return doJSON[nightResponse](t, mux, http.MethodPost, "/groups/"+group+"/nights/"+nightID+"/movie", body)
}

// attendeeIDs lists a night's attendee ids in the response's order (core
// first, then by name).
func attendeeIDs(n nightResponse) []string {
	ids := make([]string, 0, len(n.Attendees))
	for _, a := range n.Attendees {
		ids = append(ids, a.ID)
	}
	return ids
}
