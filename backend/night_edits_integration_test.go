//go:build integration

package main

import (
	"net/http"
	"slices"
	"strings"
	"testing"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestNightEditsIntegration(t *testing.T) {
	pool := freshDB(t)
	seedFixtures(t, pool)

	upstream := fakeTMDB(t)
	client := &tmdbClient{baseURL: upstream.URL, token: "test", client: upstream.Client()}

	mux := http.NewServeMux()
	q := db.New(pool)
	mux.Handle("POST /groups/{groupId}/nights", createNightHandler(q))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}", nightDetailHandler(q))
	mux.Handle("PATCH /groups/{groupId}/nights/{nightId}", updateNightHandler(pool))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/pick", recordNightPickHandler(q))
	mux.Handle("DELETE /groups/{groupId}/nights/{nightId}", deleteNightHandler(q))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/movie", recordNightMovieHandler(q, client))
	mux.Handle("DELETE /groups/{groupId}/nights/{nightId}/movie", clearNightMovieHandler(q))

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
			`{"scheduledFor":"2026-07-04"}`)
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
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID, `{"scheduledFor":"2026-07-04"}`); code != http.StatusConflict {
			t.Fatalf("patch status = %d, want 409", code)
		}
	})

	t.Run("PATCH bad date yields 400", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID, `{"scheduledFor":"nope"}`); code != http.StatusBadRequest {
			t.Fatalf("bad date status = %d, want 400", code)
		}
	})

	t.Run("PATCH attendees replaces the set", func(t *testing.T) {
		n := mkNight(t) // Ada picks, alone
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID, `{"attendees":["`+ada+`","`+frankie+`"]}`); code != http.StatusOK {
			t.Fatalf("add guest status = %d, want 200", code)
		}
		code, got := doJSON[nightResponse](t, mux, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			`{"attendees":["`+ada+`","`+blake+`"]}`)
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
			!slices.Equal(attendeeIDs(after), attendeeIDs(before)) {
			t.Fatalf("night after rejected edit = %+v, want unchanged %+v", after, before)
		}
	}

	t.Run("PATCH onto a taken date with new attendees changes nothing", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodPost, "/groups/"+seededGroup+"/nights", nightBody("2026-07-04", blake)); code != http.StatusCreated {
			t.Fatalf("create second night = %d, want 201", code)
		}
		// The attendee change is valid on its own; only the date fails, last.
		code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			`{"scheduledFor":"2026-07-04","attendees":["`+ada+`","`+cleo+`"]}`)
		if code != http.StatusConflict {
			t.Fatalf("patch status = %d, want 409", code)
		}
		unchanged(t, n)
	})

	t.Run("PATCH with a non-member attendee yields 422 and changes nothing", func(t *testing.T) {
		n := mkNight(t)
		code, body := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID,
			`{"scheduledFor":"2026-07-04","attendees":["`+ada+`","`+unknownUser+`"]}`)
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
			`{"scheduledFor":"2026-07-04","attendees":["`+blake+`"]}`)
		if code != http.StatusUnprocessableEntity {
			t.Fatalf("patch status = %d, want 422", code)
		}
		unchanged(t, n)
	})

	t.Run("PATCH with no attendees yields 422 (the picker is always one)", func(t *testing.T) {
		n := mkNight(t)
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+n.ID, `{"attendees":[]}`); code != http.StatusUnprocessableEntity {
			t.Fatalf("patch status = %d, want 422", code)
		}
		unchanged(t, n)
	})

	t.Run("PATCH an unknown night yields 404", func(t *testing.T) {
		if code, _ := do(t, http.MethodPatch, "/groups/"+seededGroup+"/nights/"+unknownNight, `{"attendees":["`+unknownUser+`"]}`); code != http.StatusNotFound {
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
			`{"scheduledFor":"2026-07-04","attendees":["`+cleo+`","`+ada+`"]}`)
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
			{"edit attendees", http.MethodPatch, base, `{"attendees":["` + ada + `","` + blake + `"]}`},
			{"edit date", http.MethodPatch, base, `{"scheduledFor":"2026-07-04"}`},
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
