package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// mustDate parses an ISO date for table-driven tests, failing on a bad literal.
func mustDate(t *testing.T, s string) time.Time {
	t.Helper()
	tm, err := time.Parse("2006-01-02", s)
	if err != nil {
		t.Fatalf("parse date %q: %v", s, err)
	}
	return tm
}

func str(s string) *string { return &s }

// equalPtr reports whether got holds want, reading "" as nil.
func equalPtr(got *string, want string) bool {
	if want == "" {
		return got == nil
	}
	return got != nil && *got == want
}

func TestNightCreateRequestValidation(t *testing.T) {
	const a = "a0000000-0000-0000-0000-000000000001"
	const b = "a0000000-0000-0000-0000-000000000002"

	tests := []struct {
		name      string
		req       createNightRequest
		wantErr   bool
		wantCount int    // attendee count when valid
		wantStart string // "" = no start time
	}{
		{name: "with a start time", req: createNightRequest{ScheduledFor: "2026-06-12", StartTime: str("19:30"), Attendees: []string{a}, PickerID: a}, wantCount: 1, wantStart: "19:30"},
		{name: "bad start time", req: createNightRequest{ScheduledFor: "2026-06-12", StartTime: str("7pm"), Attendees: []string{a}, PickerID: a}, wantErr: true},
		{name: "start time with seconds", req: createNightRequest{ScheduledFor: "2026-06-12", StartTime: str("19:30:00"), Attendees: []string{a}, PickerID: a}, wantErr: true},
		{name: "valid", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{a, b}, PickerID: a}, wantCount: 2},
		{name: "dedupes attendees", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{a, a, b}, PickerID: b}, wantCount: 2},
		{name: "bad date", req: createNightRequest{ScheduledFor: "12-06-2026", Attendees: []string{a}, PickerID: a}, wantErr: true},
		{name: "bad attendee uuid", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{"nope"}, PickerID: a}, wantErr: true},
		{name: "missing picker", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{a}}, wantErr: true},
		// That the picker attends is the schema's rule, checked on the write.
		{name: "picker not attending", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{a}, PickerID: b}, wantCount: 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := validateCreateNightRequest(tt.req)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(parsed.Attendees) != tt.wantCount {
				t.Errorf("attendee count = %d, want %d", len(parsed.Attendees), tt.wantCount)
			}
			if parsed.Picker.String() != tt.req.PickerID {
				t.Errorf("Picker = %s, want %s", parsed.Picker, tt.req.PickerID)
			}
			if !parsed.ScheduledFor.Valid || parsed.ScheduledFor.Time.Format("2006-01-02") != "2026-06-12" {
				t.Errorf("ScheduledFor = %+v, want valid 2026-06-12", parsed.ScheduledFor)
			}
			if got := formatStartTimeWire(parsed.StartTime); !equalPtr(got, tt.wantStart) {
				t.Errorf("StartTime = %v, want %q", got, tt.wantStart)
			}
		})
	}
}

// PATCH carries the whole editable Night: every field is parsed, and a null
// (or missing) startTime means the Night has none.
func TestUpdateNightRequestValidation(t *testing.T) {
	const (
		a = "a0000000-0000-0000-0000-000000000001"
		b = "a0000000-0000-0000-0000-000000000002"
	)
	everyone := remindersDTO{NightBefore: true, MorningOf: true, TwoHoursBefore: true, Audience: "everyone"}
	valid := func(edit func(*updateNightRequest)) updateNightRequest {
		req := updateNightRequest{ScheduledFor: "2026-07-04", StartTime: str("20:15"), Attendees: []string{a, b}, Reminders: everyone}
		edit(&req)
		return req
	}
	tests := []struct {
		name          string
		req           updateNightRequest
		wantErr       bool
		wantStart     string // "" = no start time
		wantAttendees int
	}{
		{name: "whole night", req: valid(func(*updateNightRequest) {}), wantStart: "20:15", wantAttendees: 2},
		{name: "null start time is none", req: valid(func(r *updateNightRequest) { r.StartTime = nil }), wantAttendees: 2},
		{name: "no attendees parses (editNight rejects it: no picker)", req: valid(func(r *updateNightRequest) { r.Attendees = nil }), wantStart: "20:15"},
		{name: "bad date", req: valid(func(r *updateNightRequest) { r.ScheduledFor = "nope" }), wantErr: true},
		{name: "bad start time", req: valid(func(r *updateNightRequest) { r.StartTime = str("8:15 PM") }), wantErr: true},
		{name: "bad attendee uuid", req: valid(func(r *updateNightRequest) { r.Attendees = []string{"nope"} }), wantErr: true},
		{name: "missing reminders", req: valid(func(r *updateNightRequest) { r.Reminders = remindersDTO{} }), wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := validateUpdateNightRequest(tt.req)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %+v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if d := got.ScheduledFor.Time.Format("2006-01-02"); d != "2026-07-04" {
				t.Errorf("date = %s, want 2026-07-04", d)
			}
			if s := formatStartTimeWire(got.StartTime); !equalPtr(s, tt.wantStart) {
				t.Errorf("start time = %v, want %q", s, tt.wantStart)
			}
			if got.Attendees == nil || len(got.Attendees) != tt.wantAttendees {
				t.Errorf("attendees = %v, want %d (non-nil)", got.Attendees, tt.wantAttendees)
			}
			if got.Reminders.Audience != "everyone" {
				t.Errorf("reminders = %+v, want everyone", got.Reminders)
			}
		})
	}
}

// PATCH's optional pickerId changes the picker in the same edit, and
// watched: true records the Night. Omitted, both leave the stored Night as is.
func TestUpdateNightRequestPickerAndWatched(t *testing.T) {
	const a = "a0000000-0000-0000-0000-000000000001"
	everyone := remindersDTO{Audience: "everyone"}
	tests := []struct {
		name        string
		pickerID    *string
		watched     bool
		wantErr     bool
		wantPicker  string // "" = picker unchanged
		wantWatched bool
	}{
		{name: "neither: picker kept, not recorded"},
		{name: "a new picker", pickerID: str(a), wantPicker: a},
		{name: "recorded", watched: true, wantWatched: true},
		{name: "bad picker uuid", pickerID: str("nope"), wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := validateUpdateNightRequest(updateNightRequest{
				ScheduledFor: "2026-07-04", Attendees: []string{a}, Reminders: everyone,
				PickerID: tt.pickerID, Watched: tt.watched,
			})
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %+v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			picker := ""
			if got.Picker.Valid {
				picker = uuid.UUID(got.Picker.Bytes).String()
			}
			if picker != tt.wantPicker {
				t.Errorf("picker = %q, want %q", picker, tt.wantPicker)
			}
			if got.Watched != tt.wantWatched {
				t.Errorf("watched = %v, want %v", got.Watched, tt.wantWatched)
			}
		})
	}
}

func TestValidateReminders(t *testing.T) {
	tests := []struct {
		name    string
		req     remindersDTO
		wantErr bool
	}{
		{name: "everyone", req: remindersDTO{NightBefore: true, TwoHoursBefore: true, Audience: "everyone"}},
		{name: "just the picker, all slots off", req: remindersDTO{Audience: "picker"}},
		{name: "unknown audience", req: remindersDTO{NightBefore: true, Audience: "all"}, wantErr: true},
		{name: "missing audience", req: remindersDTO{NightBefore: true}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := validateReminders(tt.req); (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestPresentIDsIsNonNilWhenEmpty(t *testing.T) {
	// An attendee-less night must rank NOBODY, so present must be empty-non-nil
	// (encodes as SQL '{}'), never nil (which RankGroupTurn treats as "rank all").
	ids := presentIDs(nil)
	if ids == nil {
		t.Fatalf("presentIDs(nil) = nil, want non-nil empty slice")
	}
	if len(ids) != 0 {
		t.Fatalf("len = %d, want 0", len(ids))
	}
}

func TestNewNightResponse(t *testing.T) {
	nightID := uuid.MustParse("b0000000-0000-0000-0000-0000000000aa")
	ada := uuid.MustParse("a0000000-0000-0000-0000-000000000001")

	mkNight := func() db.FullNight {
		return db.FullNight{ID: nightID, ScheduledFor: pgtype.Date{Time: mustDate(t, "2026-06-12"), Valid: true}}
	}

	t.Run("maps pick and attendees", func(t *testing.T) {
		got := newNightResponse(mkNight(), []attendee{{ID: ada.String(), Name: "Ada", Role: "core"}})
		if got.ID != nightID.String() {
			t.Errorf("ID = %q", got.ID)
		}
		if got.ScheduledFor != "2026-06-12" {
			t.Errorf("ScheduledFor = %q, want 2026-06-12", got.ScheduledFor)
		}
		if len(got.Attendees) != 1 || got.Attendees[0].Name != "Ada" || got.Attendees[0].Role != "core" {
			t.Errorf("attendees = %+v", got.Attendees)
		}
	})

	t.Run("nil rows yields non-nil empty attendees slice", func(t *testing.T) {
		got := newNightResponse(mkNight(), nil)
		if got.Attendees == nil {
			t.Errorf("Attendees must be non-nil even when rows is nil")
		}
		if len(got.Attendees) != 0 {
			t.Errorf("len = %d, want 0", len(got.Attendees))
		}
	})

	t.Run("reminders carry the night's settings", func(t *testing.T) {
		n := mkNight()
		n.RemindNightBefore = true
		n.RemindTwoHoursBefore = true
		n.RemindAudience = db.ReminderAudiencePicker
		got := newNightResponse(n, nil).Reminders
		want := remindersDTO{NightBefore: true, MorningOf: false, TwoHoursBefore: true, Audience: "picker"}
		if got != want {
			t.Errorf("Reminders = %+v, want %+v", got, want)
		}
	})

	t.Run("startTime is null when unset and HH:MM when set", func(t *testing.T) {
		if got := newNightResponse(mkNight(), nil).StartTime; got != nil {
			t.Errorf("StartTime = %q, want nil", *got)
		}
		n := mkNight()
		n.StartTime = pgtype.Time{Microseconds: (19*60 + 5) * 60 * 1e6, Valid: true}
		if got := newNightResponse(n, nil).StartTime; !equalPtr(got, "19:05") {
			t.Errorf("StartTime = %v, want 19:05", got)
		}
	})

	t.Run("movie is null when unset and populated when set", func(t *testing.T) {
		none := newNightResponse(mkNight(), nil)
		if none.Movie != nil {
			t.Errorf("Movie = %v, want nil", none.Movie)
		}
		n := mkNight()
		n.MovieTmdbID = pgtype.Int4{Int32: 438631, Valid: true}
		n.MovieTitle = pgtype.Text{String: "Dune", Valid: true}
		n.MovieReleaseYear = pgtype.Int4{Int32: 2021, Valid: true}
		n.MoviePosterPath = pgtype.Text{String: "/dune.jpg", Valid: true}
		got := newNightResponse(n, nil)
		if got.Movie == nil || got.Movie.TMDBID != 438631 || got.Movie.Title != "Dune" ||
			got.Movie.ReleaseYear == nil || *got.Movie.ReleaseYear != 2021 {
			t.Errorf("Movie = %+v", got.Movie)
		}
		if got.Movie.PosterURL == nil || *got.Movie.PosterURL != "https://image.tmdb.org/t/p/w342/dune.jpg" {
			t.Errorf("Movie poster = %v, want built w342 url", got.Movie.PosterURL)
		}
		noYear := mkNight() // release year and poster zero values → Valid false
		noYear.MovieTmdbID = pgtype.Int4{Int32: 841, Valid: true}
		noYear.MovieTitle = pgtype.Text{String: "Dune", Valid: true}
		got2 := newNightResponse(noYear, nil)
		if got2.Movie == nil || got2.Movie.ReleaseYear != nil {
			t.Errorf("Movie release year = %+v, want nil", got2.Movie)
		}
		if got2.Movie.PosterURL != nil {
			t.Errorf("Movie poster = %v, want nil (no poster_path)", got2.Movie.PosterURL)
		}
	})
}

func TestToMovieResults(t *testing.T) {
	in := []movieResult{
		{TMDBID: 438631, Title: "Dune", ReleaseYear: intp(2021), PosterPath: "/dune.jpg"},
		{TMDBID: 99, Title: "No Poster", ReleaseYear: nil, PosterPath: ""},
	}
	got := toMovieResults(in)
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2", len(got))
	}
	if got[0].TMDBID != 438631 || got[0].Title != "Dune" || got[0].ReleaseYear == nil || *got[0].ReleaseYear != 2021 {
		t.Errorf("[0] = %+v, want fields preserved", got[0])
	}
	if got[0].PosterURL == nil || *got[0].PosterURL != "https://image.tmdb.org/t/p/w342/dune.jpg" {
		t.Errorf("[0] poster = %v, want built url", got[0].PosterURL)
	}
	if got[1].PosterURL != nil {
		t.Errorf("[1] poster = %v, want nil", got[1].PosterURL)
	}
	// Search hits carry only genre ids and no runtime, so the DTO always has
	// genres [] (never null) and runtimeMinutes null.
	if got[1].Genres == nil || len(got[1].Genres) != 0 {
		t.Errorf("[1] genres = %#v, want []", got[1].Genres)
	}
	if got[1].RuntimeMinutes != nil {
		t.Errorf("[1] runtime = %v, want nil", got[1].RuntimeMinutes)
	}
}

func TestGroupAttendees(t *testing.T) {
	n1 := uuid.MustParse("b0000000-0000-0000-0000-0000000000aa")
	n2 := uuid.MustParse("b0000000-0000-0000-0000-0000000000bb")
	ada := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	blake := uuid.MustParse("a0000000-0000-0000-0000-000000000002")
	rows := []db.ListAttendeesRow{
		{NightID: n1, ID: ada, Name: "Ada", Role: db.MembershipRoleCore},
		{NightID: n1, ID: blake, Name: "Blake", Role: db.MembershipRoleCore},
		{NightID: n2, ID: ada, Name: "Ada", Role: db.MembershipRoleCore},
	}
	got := groupAttendees(rows)
	if len(got[n1]) != 2 || len(got[n2]) != 1 {
		t.Fatalf("want 2 + 1 attendees, got %d + %d", len(got[n1]), len(got[n2]))
	}
	if got[n1][0].Name != "Ada" || got[n1][1].Name != "Blake" {
		t.Fatalf("attendee order not preserved: %+v", got[n1])
	}
}

func TestToNightResponses(t *testing.T) {
	n1 := uuid.MustParse("b0000000-0000-0000-0000-0000000000aa") // newest, has movie + attendees
	n2 := uuid.MustParse("b0000000-0000-0000-0000-0000000000bb") // older, no movie, no attendees
	ada := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	rows := []db.FullNight{
		{
			ID:           n1,
			PickerID:     ada,
			ScheduledFor: pgtype.Date{Time: mustDate(t, "2026-06-01"), Valid: true},
			MovieTmdbID:  pgtype.Int4{Int32: 27205, Valid: true},
			MovieTitle:   pgtype.Text{String: "Inception", Valid: true},
		},
		{
			ID:           n2,
			PickerID:     ada,
			ScheduledFor: pgtype.Date{Time: mustDate(t, "2026-05-01"), Valid: true},
		},
	}
	byNight := map[uuid.UUID][]attendee{
		n1: {{ID: ada.String(), Name: "Ada", Role: "core"}},
	}
	got := toNightResponses(rows, byNight)
	if len(got) != 2 {
		t.Fatalf("want 2 nights, got %d", len(got))
	}
	if got[0].ID != n1.String() || got[1].ID != n2.String() {
		t.Fatalf("order not preserved: %s then %s", got[0].ID, got[1].ID)
	}
	if got[1].Attendees == nil || len(got[1].Attendees) != 0 {
		t.Fatalf("want empty (non-nil) attendees, got %+v", got[1].Attendees)
	}
}

func TestValidateMovieRequest(t *testing.T) {
	if err := validateMovieRequest(movieRequest{TMDBID: 438631}); err != nil {
		t.Errorf("valid tmdbId rejected: %v", err)
	}
	if err := validateMovieRequest(movieRequest{TMDBID: 0}); err == nil {
		t.Error("tmdbId 0 accepted, want error")
	}
}

// deref is *s, or "" for nil.
func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// A Night can be recorded as watched up to one day after the server's UTC date
// (ADR-0013): every zone's today is at most a day ahead of UTC (UTC+14), so a
// Night dated today anywhere is accepted.
func TestRecordableAsWatched(t *testing.T) {
	// 10:30 UTC on 3 Nov is already 00:30 on 4 Nov in UTC+14, and still
	// 22:30 on 2 Nov in UTC-12.
	now := time.Date(2026, 11, 3, 10, 30, 0, 0, time.UTC)
	tests := []struct {
		name         string
		scheduledFor string
		now          time.Time
		want         bool
	}{
		{name: "dated today in UTC-12", scheduledFor: "2026-11-02", now: now, want: true},
		{name: "dated the UTC date", scheduledFor: "2026-11-03", now: now, want: true},
		{name: "dated today in UTC+14", scheduledFor: "2026-11-04", now: now, want: true},
		{name: "two days after the UTC date", scheduledFor: "2026-11-05", now: now, want: false},
		{name: "a non-UTC clock is read as UTC", scheduledFor: "2026-11-05",
			now: time.Date(2026, 11, 4, 1, 0, 0, 0, time.FixedZone("UTC+14", 14*3600)), want: false},
		{name: "end of the UTC day", scheduledFor: "2026-11-04",
			now: time.Date(2026, 11, 3, 23, 59, 59, 0, time.UTC), want: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d, err := parseScheduledFor(tt.scheduledFor)
			if err != nil {
				t.Fatal(err)
			}
			if got := recordableAsWatched(d, tt.now); got != tt.want {
				t.Errorf("recordableAsWatched(%s, %v) = %v, want %v", tt.scheduledFor, tt.now, got, tt.want)
			}
		})
	}
}

// A Night write that breaks a schema rule answers by the constraint's name; any
// other database error is a 500.
func TestWriteNightError(t *testing.T) {
	violation := func(code, constraint string) error {
		return fmt.Errorf("commit: %w", &pgconn.PgError{Code: code, ConstraintName: constraint})
	}
	tests := []struct {
		name     string
		err      error
		wantCode int
		wantMsg  string
	}{
		{name: "date taken", err: violation("23505", "uq_night_per_group_date"), wantCode: http.StatusConflict, wantMsg: "there is already a night on that date"},
		{name: "picker not attending, at commit", err: violation("23503", "fk_night_picker_attends"), wantCode: http.StatusUnprocessableEntity, wantMsg: "picker is not an attendee of this night"},
		{name: "picker not a member", err: violation("23503", "fk_night_picker_member"), wantCode: http.StatusUnprocessableEntity, wantMsg: "picker is not a member of this group"},
		{name: "attendee not a member", err: violation("23503", "fk_attendance_member"), wantCode: http.StatusUnprocessableEntity, wantMsg: "attendee is not a member of this group"},
		{name: "watched without a film", err: violation("23514", "ck_night_watched_has_film"), wantCode: http.StatusUnprocessableEntity, wantMsg: "a watched night must have a film"},
		{name: "watched and repeating", err: violation("23514", "ck_night_watched_no_repeat"), wantCode: http.StatusUnprocessableEntity, wantMsg: "a watched night can't repeat"},
		{name: "another constraint is a bug", err: violation("23505", "movies_tmdb_id_key"), wantCode: http.StatusInternalServerError, wantMsg: "internal server error"},
		{name: "missing night", err: pgx.ErrNoRows, wantCode: http.StatusNotFound, wantMsg: "night not found"},
		{name: "dated ahead", err: errWatchedDateAhead, wantCode: http.StatusUnprocessableEntity, wantMsg: errWatchedDateAhead.Error()},
		{name: "anything else", err: errors.New("boom"), wantCode: http.StatusInternalServerError, wantMsg: "internal server error"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			writeNightError(rec, uuid.Nil, "test", tt.err)
			var body struct{ Error string }
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("decode body %q: %v", rec.Body, err)
			}
			if rec.Code != tt.wantCode || body.Error != tt.wantMsg {
				t.Errorf("got %d %q, want %d %q", rec.Code, body.Error, tt.wantCode, tt.wantMsg)
			}
		})
	}
}
