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

func TestNightCreateRequestValidation(t *testing.T) {
	const a = "a0000000-0000-0000-0000-000000000001"
	const b = "a0000000-0000-0000-0000-000000000002"

	tests := []struct {
		name          string
		req           createNightRequest
		wantErr       bool
		wantNotAttend bool // the error is errPickerNotAttendee (a 422, not a 400)
		wantCount     int  // attendee count when valid
	}{
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
		})
	}
}

func TestUpdateNightRequestValidation(t *testing.T) {
	const (
		a = "a0000000-0000-0000-0000-000000000001"
		b = "a0000000-0000-0000-0000-000000000002"
	)
	date := func(s string) *string { return &s }
	ids := func(s ...string) *[]string { return &s }
	on, everyone := true, "everyone"
	tests := []struct {
		name          string
		req           updateNightRequest
		wantErr       bool
		wantDate      string // "" = date unchanged
		wantAttendees int    // -1 = attendees unchanged
	}{
		{name: "date only", req: updateNightRequest{ScheduledFor: date("2026-07-04")}, wantDate: "2026-07-04", wantAttendees: -1},
		{name: "attendees only", req: updateNightRequest{Attendees: ids(a, b)}, wantAttendees: 2},
		{name: "both", req: updateNightRequest{ScheduledFor: date("2026-07-04"), Attendees: ids(a)}, wantDate: "2026-07-04", wantAttendees: 1},
		{name: "dedupes attendees", req: updateNightRequest{Attendees: ids(a, a, b)}, wantAttendees: 2},
		{name: "empty attendees is a replacement, not unchanged", req: updateNightRequest{Attendees: ids()}, wantAttendees: 0},
		{name: "reminders only", req: updateNightRequest{Reminders: &remindersRequest{NightBefore: &on, MorningOf: &on, Audience: &everyone}}, wantAttendees: -1},
		{name: "invalid reminders", req: updateNightRequest{Reminders: &remindersRequest{NightBefore: &on}}, wantErr: true},
		{name: "nothing to update", req: updateNightRequest{}, wantErr: true},
		{name: "bad date", req: updateNightRequest{ScheduledFor: date("nope")}, wantErr: true},
		{name: "empty date", req: updateNightRequest{ScheduledFor: date("")}, wantErr: true},
		{name: "bad attendee uuid", req: updateNightRequest{Attendees: ids("nope")}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := validateUpdateNightRequest(tt.req)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			switch {
			case tt.wantDate == "" && got.ScheduledFor != nil:
				t.Errorf("date = %+v, want unchanged (nil)", got.ScheduledFor)
			case tt.wantDate != "" && (got.ScheduledFor == nil || got.ScheduledFor.Time.Format("2006-01-02") != tt.wantDate):
				t.Errorf("date = %+v, want %s", got.ScheduledFor, tt.wantDate)
			}
			switch {
			case tt.wantAttendees == -1 && got.Attendees != nil:
				t.Errorf("attendees = %v, want unchanged (nil)", got.Attendees)
			case tt.wantAttendees >= 0 && (got.Attendees == nil || len(got.Attendees) != tt.wantAttendees):
				t.Errorf("attendees = %v, want %d (non-nil)", got.Attendees, tt.wantAttendees)
			}
		})
	}
}

func TestParseReminders(t *testing.T) {
	yes, no := true, false
	str := func(s string) *string { return &s }
	tests := []struct {
		name    string
		req     remindersRequest
		want    nightReminders
		wantErr bool
	}{
		{name: "everyone", req: remindersRequest{NightBefore: &yes, MorningOf: &no, Audience: str("everyone")},
			want: nightReminders{NightBefore: true, MorningOf: false, Audience: db.ReminderAudienceEveryone}},
		{name: "just the picker, all slots off", req: remindersRequest{NightBefore: &no, MorningOf: &no, Audience: str("picker")},
			want: nightReminders{Audience: db.ReminderAudiencePicker}},
		{name: "unknown audience", req: remindersRequest{NightBefore: &yes, MorningOf: &yes, Audience: str("all")}, wantErr: true},
		{name: "missing nightBefore", req: remindersRequest{MorningOf: &yes, Audience: str("everyone")}, wantErr: true},
		{name: "missing morningOf", req: remindersRequest{NightBefore: &yes, Audience: str("everyone")}, wantErr: true},
		{name: "missing audience", req: remindersRequest{NightBefore: &yes, MorningOf: &yes}, wantErr: true},
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
		n.RemindAudience = db.ReminderAudiencePicker
		got := toNightResponse(n, nil).Reminders
		want := remindersDTO{NightBefore: true, MorningOf: false, Audience: "picker"}
		if got != want {
			t.Errorf("Reminders = %+v, want %+v", got, want)
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
	rows := []db.ListNightsRow{
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
