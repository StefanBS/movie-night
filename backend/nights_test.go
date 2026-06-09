package main

import (
	"testing"
	"time"

	"github.com/google/uuid"

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
	pick := db.Pick{ID: nightID}
	pick.ScheduledFor.Time = mustDate(t, "2026-06-12")
	pick.ScheduledFor.Valid = true

	rows := []db.ListNightAttendeesRow{
		{ID: ada, Name: "Ada", Role: db.MembershipRoleCore},
	}
	got := toNightResponse(pick, rows)
	if got.ID != nightID.String() {
		t.Errorf("ID = %q", got.ID)
	}
	if got.ScheduledFor != "2026-06-12" {
		t.Errorf("ScheduledFor = %q, want 2026-06-12", got.ScheduledFor)
	}
	if len(got.Attendees) != 1 || got.Attendees[0].Name != "Ada" || got.Attendees[0].Role != "core" {
		t.Errorf("attendees = %+v", got.Attendees)
	}
}
