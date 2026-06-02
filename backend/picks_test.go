package main

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func boolPtr(b bool) *bool { return &b }

func TestValidatePickRequest(t *testing.T) {
	picker := "a0000000-0000-0000-0000-000000000001"

	t.Run("defaults isCredited to true when omitted", func(t *testing.T) {
		got, err := validatePickRequest(pickRequest{PickerID: picker, ScheduledFor: "2026-06-02"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.PickerID != uuid.MustParse(picker) {
			t.Errorf("PickerID = %v", got.PickerID)
		}
		if !got.IsCredited {
			t.Errorf("IsCredited = false, want true")
		}
		if !got.ScheduledFor.Valid || got.ScheduledFor.Time.Format("2006-01-02") != "2026-06-02" {
			t.Errorf("ScheduledFor = %+v", got.ScheduledFor)
		}
	})

	t.Run("preserves an explicit isCredited false", func(t *testing.T) {
		got, err := validatePickRequest(pickRequest{PickerID: picker, ScheduledFor: "2026-06-02", IsCredited: boolPtr(false)})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.IsCredited {
			t.Errorf("IsCredited = true, want false")
		}
	})

	t.Run("preserves an explicit isCredited true", func(t *testing.T) {
		got, err := validatePickRequest(pickRequest{PickerID: picker, ScheduledFor: "2026-06-02", IsCredited: boolPtr(true)})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !got.IsCredited {
			t.Errorf("IsCredited = false, want true")
		}
	})

	invalid := []struct {
		name string
		req  pickRequest
	}{
		{name: "empty pickerId", req: pickRequest{PickerID: "", ScheduledFor: "2026-06-02"}},
		{name: "malformed pickerId", req: pickRequest{PickerID: "not-a-uuid", ScheduledFor: "2026-06-02"}},
		{name: "empty scheduledFor", req: pickRequest{PickerID: picker, ScheduledFor: ""}},
		{name: "malformed scheduledFor", req: pickRequest{PickerID: picker, ScheduledFor: "06/02/2026"}},
	}
	for _, tc := range invalid {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := validatePickRequest(tc.req); err == nil {
				t.Fatal("expected error, got nil")
			}
		})
	}
}

func TestToPickResponse(t *testing.T) {
	id := uuid.MustParse("c0000000-0000-0000-0000-000000000001")
	gid := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	pid := uuid.MustParse("a0000000-0000-0000-0000-000000000002")

	p := db.Pick{
		ID:           id,
		GroupID:      gid,
		PickerID:     pgtype.UUID{Bytes: pid, Valid: true},
		IsCredited:   true,
		ScheduledFor: pgtype.Date{Time: time.Date(2026, 6, 2, 0, 0, 0, 0, time.UTC), Valid: true},
		CreatedAt:    pgtype.Timestamptz{Time: time.Date(2026, 6, 2, 15, 4, 5, 0, time.UTC), Valid: true},
	}
	got := toPickResponse(p)
	want := pickResponse{
		ID:           id.String(),
		GroupID:      gid.String(),
		PickerID:     pid.String(),
		IsCredited:   true,
		ScheduledFor: "2026-06-02",
		CreatedAt:    "2026-06-02T15:04:05Z",
	}
	if got != want {
		t.Errorf("got %+v, want %+v", got, want)
	}
}
