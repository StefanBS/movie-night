package main

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestParsePresent(t *testing.T) {
	id1 := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	id2 := uuid.MustParse("a0000000-0000-0000-0000-000000000002")

	tests := []struct {
		name    string
		raw     string
		want    []uuid.UUID
		wantErr bool
	}{
		{name: "empty string yields nil", raw: "", want: nil},
		{name: "blank string yields nil", raw: "   ", want: nil},
		{name: "single id", raw: id1.String(), want: []uuid.UUID{id1}},
		{name: "multiple ids", raw: id1.String() + "," + id2.String(), want: []uuid.UUID{id1, id2}},
		{name: "trims whitespace around ids", raw: " " + id1.String() + " , " + id2.String() + " ", want: []uuid.UUID{id1, id2}},
		{name: "skips trailing blank segment", raw: id1.String() + ",", want: []uuid.UUID{id1}},
		{name: "preserves duplicates", raw: id1.String() + "," + id1.String(), want: []uuid.UUID{id1, id1}},
		{name: "malformed value errors", raw: id1.String() + ",not-a-uuid", wantErr: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parsePresent(tc.raw)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(got) != len(tc.want) {
				t.Fatalf("len = %d, want %d (%v)", len(got), len(tc.want), got)
			}
			for i := range tc.want {
				if got[i] != tc.want[i] {
					t.Errorf("[%d] = %v, want %v", i, got[i], tc.want[i])
				}
			}
		})
	}
}

func TestToTurnResponses(t *testing.T) {
	id1 := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	id2 := uuid.MustParse("a0000000-0000-0000-0000-000000000002")
	apr10 := pgtype.Date{Time: time.Date(2026, 4, 10, 0, 0, 0, 0, time.UTC), Valid: true}
	apr10Str := "2026-04-10"

	t.Run("nil rows yields empty non-nil slice", func(t *testing.T) {
		got := toTurnResponses(nil)
		if got == nil {
			t.Fatal("returned nil; want non-nil slice")
		}
		if len(got) != 0 {
			t.Fatalf("len = %d, want 0", len(got))
		}
	})

	t.Run("maps fields, preserves order, handles null date", func(t *testing.T) {
		rows := []db.RankGroupTurnRow{
			{ID: id1, Name: "Ada", Role: db.MembershipRoleCore, ServedCount: 0, LastPickedOn: pgtype.Date{}},
			{ID: id2, Name: "Blake", Role: db.MembershipRoleCore, ServedCount: 1, LastPickedOn: apr10},
		}
		got := toTurnResponses(rows)
		if len(got) != 2 {
			t.Fatalf("len = %d, want 2", len(got))
		}
		if got[0].ID != id1.String() || got[0].Name != "Ada" || got[0].Role != "core" || got[0].ServedCount != 0 {
			t.Errorf("[0] = %+v", got[0])
		}
		if got[0].LastPickedOn != nil {
			t.Errorf("[0].LastPickedOn = %v, want nil", *got[0].LastPickedOn)
		}
		if got[1].ServedCount != 1 {
			t.Errorf("[1].ServedCount = %d, want 1", got[1].ServedCount)
		}
		if got[1].LastPickedOn == nil || *got[1].LastPickedOn != apr10Str {
			t.Errorf("[1].LastPickedOn = %v, want %q", got[1].LastPickedOn, apr10Str)
		}
	})
}
