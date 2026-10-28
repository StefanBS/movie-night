package main

import (
	"errors"
	"maps"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
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
		name          string
		req           createNightRequest
		wantErr       bool
		wantNotAttend bool   // the error is errPickerNotAttendee (a 422, not a 400)
		wantCount     int    // attendee count when valid
		wantStart     string // "" = no start time
	}{
		{name: "with a start time", req: createNightRequest{ScheduledFor: "2026-06-12", StartTime: str("19:30"), Attendees: []string{a}, PickerID: a}, wantCount: 1, wantStart: "19:30"},
		{name: "a null start time is none", req: createNightRequest{ScheduledFor: "2026-06-12", StartTime: nil, Attendees: []string{a}, PickerID: a}, wantCount: 1},
		{name: "bad start time", req: createNightRequest{ScheduledFor: "2026-06-12", StartTime: str("7pm"), Attendees: []string{a}, PickerID: a}, wantErr: true},
		{name: "start time with seconds", req: createNightRequest{ScheduledFor: "2026-06-12", StartTime: str("19:30:00"), Attendees: []string{a}, PickerID: a}, wantErr: true},
		{name: "start time out of range", req: createNightRequest{ScheduledFor: "2026-06-12", StartTime: str("24:00"), Attendees: []string{a}, PickerID: a}, wantErr: true},
		{name: "valid", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{a, b}, PickerID: a}, wantCount: 2},
		{name: "picker alone", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{b}, PickerID: b}, wantCount: 1},
		{name: "dedupes attendees", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{a, a, b}, PickerID: b}, wantCount: 2},
		{name: "bad date", req: createNightRequest{ScheduledFor: "12-06-2026", Attendees: []string{a}, PickerID: a}, wantErr: true},
		{name: "empty date", req: createNightRequest{ScheduledFor: "", Attendees: []string{a}, PickerID: a}, wantErr: true},
		{name: "bad attendee uuid", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{"nope"}, PickerID: a}, wantErr: true},
		{name: "missing picker", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{a}}, wantErr: true},
		{name: "bad picker uuid", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{a}, PickerID: "nope"}, wantErr: true},
		{name: "picker not attending", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{a}, PickerID: b}, wantErr: true, wantNotAttend: true},
		{name: "no attendees", req: createNightRequest{ScheduledFor: "2026-06-12", PickerID: a}, wantErr: true, wantNotAttend: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := validateCreateNightRequest(tt.req)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				if got := errors.Is(err, errPickerNotAttendee); got != tt.wantNotAttend {
					t.Fatalf("errors.Is(err, errPickerNotAttendee) = %v, want %v (err %v)", got, tt.wantNotAttend, err)
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
		{name: "dedupes attendees", req: valid(func(r *updateNightRequest) { r.Attendees = []string{a, a, b} }), wantStart: "20:15", wantAttendees: 2},
		{name: "no attendees parses (editNight rejects it: no picker)", req: valid(func(r *updateNightRequest) { r.Attendees = nil }), wantStart: "20:15"},
		{name: "bad date", req: valid(func(r *updateNightRequest) { r.ScheduledFor = "nope" }), wantErr: true},
		{name: "missing date", req: valid(func(r *updateNightRequest) { r.ScheduledFor = "" }), wantErr: true},
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
			if got.Reminders.Audience != db.ReminderAudienceEveryone {
				t.Errorf("reminders = %+v, want everyone", got.Reminders)
			}
		})
	}
}

func TestParseReminders(t *testing.T) {
	tests := []struct {
		name    string
		req     remindersDTO
		want    nightReminders
		wantErr bool
	}{
		{name: "everyone", req: remindersDTO{NightBefore: true, MorningOf: false, TwoHoursBefore: true, Audience: "everyone"},
			want: nightReminders{NightBefore: true, MorningOf: false, TwoHoursBefore: true, Audience: db.ReminderAudienceEveryone}},
		{name: "just the picker, all slots off", req: remindersDTO{Audience: "picker"},
			want: nightReminders{Audience: db.ReminderAudiencePicker}},
		{name: "unknown audience", req: remindersDTO{NightBefore: true, Audience: "all"}, wantErr: true},
		{name: "missing audience", req: remindersDTO{NightBefore: true}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseReminders(tt.req)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %+v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("got %+v, want %+v", got, tt.want)
			}
		})
	}
}

// The picker must be one of the Night's attendees; their role decides credit.
func TestAttendeeRole(t *testing.T) {
	ada := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	frankie := uuid.MustParse("a0000000-0000-0000-0000-000000000006")
	stranger := uuid.MustParse("a0000000-0000-0000-0000-0000000000ff")
	attendees := []db.ListNightAttendeesRow{
		{ID: ada, Name: "Ada", Role: db.MembershipRoleCore},
		{ID: frankie, Name: "Frankie", Role: db.MembershipRoleGuest},
	}
	tests := []struct {
		name      string
		attendees []db.ListNightAttendeesRow
		picker    uuid.UUID
		want      db.MembershipRole
		wantErr   error
	}{
		{name: "core attendee", attendees: attendees, picker: ada, want: db.MembershipRoleCore},
		{name: "guest attendee", attendees: attendees, picker: frankie, want: db.MembershipRoleGuest},
		{name: "not attending", attendees: attendees, picker: stranger, wantErr: errPickerNotAttendee},
		{name: "no attendees", attendees: nil, picker: ada, wantErr: errPickerNotAttendee},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := attendeeRole(tt.attendees, tt.picker)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("role = %q, want %q", got, tt.want)
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

func TestToNightResponse(t *testing.T) {
	nightID := uuid.MustParse("b0000000-0000-0000-0000-0000000000aa")
	ada := uuid.MustParse("a0000000-0000-0000-0000-000000000001")

	mkNight := func() nightRow {
		return nightRow{ID: nightID, ScheduledFor: pgtype.Date{Time: mustDate(t, "2026-06-12"), Valid: true}}
	}

	t.Run("maps pick and attendees", func(t *testing.T) {
		rows := []db.ListNightAttendeesRow{
			{ID: ada, Name: "Ada", Role: db.MembershipRoleCore},
		}
		got := toNightResponse(mkNight(), rows)
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
		got := toNightResponse(mkNight(), nil)
		if got.Attendees == nil {
			t.Errorf("Attendees must be non-nil even when rows is nil")
		}
		if len(got.Attendees) != 0 {
			t.Errorf("len = %d, want 0", len(got.Attendees))
		}
	})

	t.Run("pickerId is the picker's uuid", func(t *testing.T) {
		n := mkNight()
		n.PickerID = ada
		if got := toNightResponse(n, nil); got.PickerID != ada.String() {
			t.Errorf("PickerID = %q, want %s", got.PickerID, ada)
		}
	})

	t.Run("reminders carry the night's settings", func(t *testing.T) {
		n := mkNight()
		n.RemindNightBefore = true
		n.RemindTwoHoursBefore = true
		n.RemindAudience = db.ReminderAudiencePicker
		got := toNightResponse(n, nil).Reminders
		want := remindersDTO{NightBefore: true, MorningOf: false, TwoHoursBefore: true, Audience: "picker"}
		if got != want {
			t.Errorf("Reminders = %+v, want %+v", got, want)
		}
	})

	t.Run("startTime is null when unset and HH:MM when set", func(t *testing.T) {
		if got := toNightResponse(mkNight(), nil).StartTime; got != nil {
			t.Errorf("StartTime = %q, want nil", *got)
		}
		n := mkNight()
		n.StartTime = pgtype.Time{Microseconds: (19*60 + 5) * 60 * 1e6, Valid: true}
		if got := toNightResponse(n, nil).StartTime; !equalPtr(got, "19:05") {
			t.Errorf("StartTime = %v, want 19:05", got)
		}
	})

	t.Run("movie is null when unset and populated when set", func(t *testing.T) {
		none := toNightResponse(mkNight(), nil)
		if none.Movie != nil {
			t.Errorf("Movie = %v, want nil", none.Movie)
		}
		n := mkNight()
		n.MovieTmdbID = pgtype.Int4{Int32: 438631, Valid: true}
		n.MovieTitle = pgtype.Text{String: "Dune", Valid: true}
		n.MovieReleaseYear = pgtype.Int4{Int32: 2021, Valid: true}
		n.MoviePosterPath = pgtype.Text{String: "/dune.jpg", Valid: true}
		got := toNightResponse(n, nil)
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
		got2 := toNightResponse(noYear, nil)
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
}

func TestCreditedForRole(t *testing.T) {
	if !creditedForRole(db.MembershipRoleCore) {
		t.Error("core picker must be credited")
	}
	if creditedForRole(db.MembershipRoleGuest) {
		t.Error("guest picker must not be credited")
	}
}

func TestAttendeeRoles(t *testing.T) {
	ada := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	blake := uuid.MustParse("a0000000-0000-0000-0000-000000000002")
	stranger := uuid.MustParse("a0000000-0000-0000-0000-0000000000ff")
	members := []db.FilterGroupMembersRow{
		{UserID: ada, Role: db.MembershipRoleCore},
		{UserID: blake, Role: db.MembershipRoleGuest},
	}

	tests := []struct {
		name      string
		attendees []uuid.UUID
		members   []db.FilterGroupMembersRow
		wantRoles map[uuid.UUID]db.MembershipRole
		wantBad   uuid.UUID // the id the error must name; uuid.Nil = no error
	}{
		{
			name:      "every attendee is a member",
			attendees: []uuid.UUID{ada, blake},
			members:   members,
			wantRoles: map[uuid.UUID]db.MembershipRole{ada: db.MembershipRoleCore, blake: db.MembershipRoleGuest},
		},
		{
			name:      "a non-member is named",
			attendees: []uuid.UUID{ada, stranger, blake},
			members:   members,
			wantBad:   stranger,
		},
		{
			name:      "the first missing attendee in request order is named",
			attendees: []uuid.UUID{blake, ada},
			members:   members[:1],
			wantBad:   blake,
		},
		{
			name:      "no attendees passes trivially",
			attendees: []uuid.UUID{},
			members:   nil,
			wantRoles: map[uuid.UUID]db.MembershipRole{},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			roles, err := attendeeRoles(tt.attendees, tt.members)
			if tt.wantBad != uuid.Nil {
				if !errors.Is(err, errNotMember) {
					t.Fatalf("err = %v, want errNotMember", err)
				}
				if !strings.Contains(err.Error(), tt.wantBad.String()) {
					t.Fatalf("err = %q, want it to name %s", err, tt.wantBad)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected err: %v", err)
			}
			if !maps.Equal(roles, tt.wantRoles) {
				t.Fatalf("roles = %v, want %v", roles, tt.wantRoles)
			}
		})
	}
}

func TestMovieDTOFromCols(t *testing.T) {
	base := nightRow{
		ID:           uuid.MustParse("b0000000-0000-0000-0000-0000000000aa"),
		ScheduledFor: pgtype.Date{Time: mustDate(t, "2026-05-01"), Valid: true},
	}

	t.Run("nil when no movie", func(t *testing.T) {
		if got := movieDTOFromCols(base); got != nil {
			t.Fatalf("want nil, got %+v", got)
		}
	})

	t.Run("maps the nullable columns", func(t *testing.T) {
		row := base
		row.MovieTmdbID = pgtype.Int4{Int32: 27205, Valid: true}
		row.MovieTitle = pgtype.Text{String: "Inception", Valid: true}
		row.MovieReleaseYear = pgtype.Int4{Int32: 2010, Valid: true}
		row.MoviePosterPath = pgtype.Text{String: "/inc.jpg", Valid: true}
		got := movieDTOFromCols(row)
		if got == nil || got.TMDBID != 27205 || got.Title != "Inception" {
			t.Fatalf("unexpected movie dto: %+v", got)
		}
		if got.ReleaseYear == nil || *got.ReleaseYear != 2010 {
			t.Fatalf("want release year 2010, got %v", got.ReleaseYear)
		}
		if got.PosterURL == nil {
			t.Fatalf("want a poster url, got nil")
		}
	})
}

func TestGroupAttendees(t *testing.T) {
	n1 := uuid.MustParse("b0000000-0000-0000-0000-0000000000aa")
	n2 := uuid.MustParse("b0000000-0000-0000-0000-0000000000bb")
	ada := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	blake := uuid.MustParse("a0000000-0000-0000-0000-000000000002")
	rows := []db.ListNightsAttendeesRow{
		{PickID: n1, ID: ada, Name: "Ada", Role: db.MembershipRoleCore},
		{PickID: n1, ID: blake, Name: "Blake", Role: db.MembershipRoleCore},
		{PickID: n2, ID: ada, Name: "Ada", Role: db.MembershipRoleCore},
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
	rows := []nightRow{
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
	if got[0].ScheduledFor != "2026-06-01" {
		t.Fatalf("want scheduledFor 2026-06-01, got %s", got[0].ScheduledFor)
	}
	if got[0].Movie == nil || got[0].Movie.Title != "Inception" {
		t.Fatalf("want movie Inception, got %+v", got[0].Movie)
	}
	if got[1].Movie != nil {
		t.Fatalf("want nil movie on second night, got %+v", got[1].Movie)
	}
	if got[1].Attendees == nil || len(got[1].Attendees) != 0 {
		t.Fatalf("want empty (non-nil) attendees, got %+v", got[1].Attendees)
	}
}

func TestValidateMovieRequest(t *testing.T) {
	if err := validateMovieRequest(movieRequest{TMDBID: 438631}); err != nil {
		t.Errorf("valid tmdbId rejected: %v", err)
	}
	for _, bad := range []int{0, -1} {
		if err := validateMovieRequest(movieRequest{TMDBID: bad}); err == nil {
			t.Errorf("tmdbId %d accepted, want error", bad)
		}
	}
}

// deref is *s, or "" for nil.
func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
