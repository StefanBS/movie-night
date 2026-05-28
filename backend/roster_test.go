package main

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestParseGroupID(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{name: "valid uuid", input: "11111111-1111-1111-1111-111111111111", wantErr: false},
		{name: "malformed", input: "not-a-uuid", wantErr: true},
		{name: "empty", input: "", wantErr: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseGroupID(tc.input)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("parseGroupID(%q): expected error, got nil", tc.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseGroupID(%q): unexpected error: %v", tc.input, err)
			}
			if got.String() != tc.input {
				t.Fatalf("parseGroupID(%q) = %q, want round-trip equal", tc.input, got)
			}
		})
	}
}

func TestToMemberDTOs(t *testing.T) {
	id1 := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	id2 := uuid.MustParse("a0000000-0000-0000-0000-000000000002")

	tests := []struct {
		name string
		rows []db.ListGroupMembersRow
		want []memberDTO
	}{
		{
			name: "nil rows yields empty non-nil slice",
			rows: nil,
			want: []memberDTO{},
		},
		{
			name: "preserves order and stringifies fields",
			rows: []db.ListGroupMembersRow{
				{ID: id1, Name: "Ada", Role: db.MembershipRoleCore},
				{ID: id2, Name: "Blake", Role: db.MembershipRoleGuest},
			},
			want: []memberDTO{
				{ID: id1.String(), Name: "Ada", Role: "core"},
				{ID: id2.String(), Name: "Blake", Role: "guest"},
			},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := toMemberDTOs(tc.rows)
			if got == nil {
				t.Fatal("toMemberDTOs returned nil; want non-nil slice")
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
