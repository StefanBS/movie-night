package main

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestToMemberResponses(t *testing.T) {
	id1 := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	id2 := uuid.MustParse("a0000000-0000-0000-0000-000000000002")
	joined := pgtype.Timestamptz{Time: time.Date(2026, 6, 1, 20, 0, 0, 0, time.UTC), Valid: true}

	tests := []struct {
		name string
		rows []db.ListGroupMembersRow
		want []memberResponse
	}{
		{
			name: "nil rows yields empty non-nil slice",
			rows: nil,
			want: []memberResponse{},
		},
		{
			name: "preserves order and stringifies fields",
			rows: []db.ListGroupMembersRow{
				{ID: id1, Name: "Ada", Role: db.MembershipRoleCore, Status: db.MembershipStatusActive, JoinedAt: joined},
				{ID: id2, Name: "Blake", Role: db.MembershipRoleGuest, Status: db.MembershipStatusInactive, JoinedAt: joined},
			},
			want: []memberResponse{
				{ID: id1.String(), Name: "Ada", Role: "core", Status: "active", JoinedOn: "2026-06-01"},
				{ID: id2.String(), Name: "Blake", Role: "guest", Status: "inactive", JoinedOn: "2026-06-01"},
			},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := toMemberResponses(tc.rows)
			if got == nil {
				t.Fatal("toMemberResponses returned nil; want non-nil slice")
			}
			if len(got) != len(tc.want) {
				t.Fatalf("len = %d, want %d", len(got), len(tc.want))
			}
			for i := range tc.want {
				if got[i] != tc.want[i] {
					t.Errorf("[%d] = %+v, want %+v", i, got[i], tc.want[i])
				}
			}
		})
	}
}
