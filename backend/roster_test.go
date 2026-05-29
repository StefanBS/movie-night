package main

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestToMemberResponses(t *testing.T) {
	id1 := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	id2 := uuid.MustParse("a0000000-0000-0000-0000-000000000002")

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
				{ID: id1, Name: "Ada", Role: db.MembershipRoleCore},
				{ID: id2, Name: "Blake", Role: db.MembershipRoleGuest},
			},
			want: []memberResponse{
				{ID: id1.String(), Name: "Ada", Role: "core"},
				{ID: id2.String(), Name: "Blake", Role: "guest"},
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
