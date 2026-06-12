package main

import (
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
		name      string
		req       createNightRequest
		wantErr   bool
		wantCount int // attendee count when valid
	}{
		{name: "valid with attendees", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{a, b}}, wantCount: 2},
		{name: "valid no attendees", req: createNightRequest{ScheduledFor: "2026-06-12"}, wantCount: 0},
		{name: "dedupes attendees", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{a, a, b}}, wantCount: 2},
		{name: "bad date", req: createNightRequest{ScheduledFor: "12-06-2026"}, wantErr: true},
		{name: "empty date", req: createNightRequest{ScheduledFor: ""}, wantErr: true},
		{name: "bad attendee uuid", req: createNightRequest{ScheduledFor: "2026-06-12", Attendees: []string{"nope"}}, wantErr: true},
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
			if parsed.Attendees == nil {
				t.Errorf("Attendees must be non-nil even when empty")
			}
			if !parsed.ScheduledFor.Valid || parsed.ScheduledFor.Time.Format("2006-01-02") != "2026-06-12" {
				t.Errorf("ScheduledFor = %+v, want valid 2026-06-12", parsed.ScheduledFor)
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

	mkPick := func() db.Pick {
		p := db.Pick{ID: nightID}
		p.ScheduledFor.Time = mustDate(t, "2026-06-12")
		p.ScheduledFor.Valid = true
		return p
	}

	t.Run("maps pick and attendees", func(t *testing.T) {
		rows := []db.ListNightAttendeesRow{
			{ID: ada, Name: "Ada", Role: db.MembershipRoleCore},
		}
		got := toNightResponse(mkPick(), rows, nil)
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
		got := toNightResponse(mkPick(), nil, nil)
		if got.Attendees == nil {
			t.Errorf("Attendees must be non-nil even when rows is nil")
		}
		if len(got.Attendees) != 0 {
			t.Errorf("len = %d, want 0", len(got.Attendees))
		}
	})

	t.Run("pickerId is null when unset and the uuid when set", func(t *testing.T) {
		open := toNightResponse(mkPick(), nil, nil)
		if open.PickerID != nil {
			t.Errorf("open night PickerID = %v, want nil", open.PickerID)
		}
		p := mkPick()
		p.PickerID = pgtype.UUID{Bytes: ada, Valid: true}
		got := toNightResponse(p, nil, nil)
		if got.PickerID == nil || *got.PickerID != ada.String() {
			t.Errorf("finalized PickerID = %v, want %s", got.PickerID, ada)
		}
	})

	t.Run("movie is null when unset and populated when set", func(t *testing.T) {
		none := toNightResponse(mkPick(), nil, nil)
		if none.Movie != nil {
			t.Errorf("Movie = %v, want nil", none.Movie)
		}
		m := db.Movie{TmdbID: 438631, Title: "Dune"}
		m.ReleaseYear = pgtype.Int4{Int32: 2021, Valid: true}
		got := toNightResponse(mkPick(), nil, &m)
		if got.Movie == nil || got.Movie.TMDBID != 438631 || got.Movie.Title != "Dune" ||
			got.Movie.ReleaseYear == nil || *got.Movie.ReleaseYear != 2021 {
			t.Errorf("Movie = %+v", got.Movie)
		}
		noYear := db.Movie{TmdbID: 841, Title: "Dune"} // ReleaseYear zero value → Valid false
		got2 := toNightResponse(mkPick(), nil, &noYear)
		if got2.Movie == nil || got2.Movie.ReleaseYear != nil {
			t.Errorf("Movie release year = %+v, want nil", got2.Movie)
		}
	})
}

func TestCreditedForRole(t *testing.T) {
	if !creditedForRole(db.MembershipRoleCore) {
		t.Error("core picker must be credited")
	}
	if creditedForRole(db.MembershipRoleGuest) {
		t.Error("guest picker must not be credited")
	}
}
