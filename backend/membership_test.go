package main

import (
	"testing"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestSeedBaseline(t *testing.T) {
	cases := []struct {
		name           string
		avg            float64
		existingCredit int32
		want           int32
	}{
		{name: "fresh joiner seeds to rounded average", avg: 3.0, existingCredit: 0, want: 3},
		{name: "rounds to nearest", avg: 1.4, existingCredit: 0, want: 1},
		{name: "rounds half away from zero", avg: 2.5, existingCredit: 0, want: 3},
		{name: "subtracts existing credited picks", avg: 5.0, existingCredit: 2, want: 3},
		{name: "returner with history lands at average total", avg: 4.0, existingCredit: 4, want: 0},
		{name: "never negative", avg: 2.0, existingCredit: 5, want: 0},
		{name: "empty group averages to zero", avg: 0.0, existingCredit: 0, want: 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := seedBaseline(tc.avg, tc.existingCredit); got != tc.want {
				t.Errorf("seedBaseline(%v, %d) = %d, want %d", tc.avg, tc.existingCredit, got, tc.want)
			}
		})
	}
}

func TestValidateJoin(t *testing.T) {
	t.Run("trims name and defaults role to core", func(t *testing.T) {
		name, role, err := validateJoin(joinRequest{Name: "  Ada  "})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if name != "Ada" || role != "core" {
			t.Errorf("got (%q, %q), want (\"Ada\", \"core\")", name, role)
		}
	})
	t.Run("accepts an explicit guest role", func(t *testing.T) {
		_, role, err := validateJoin(joinRequest{Name: "Bo", Role: "guest"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if role != "guest" {
			t.Errorf("role = %q, want \"guest\"", role)
		}
	})
	for _, tc := range []struct {
		name string
		req  joinRequest
	}{
		{name: "empty name", req: joinRequest{Name: ""}},
		{name: "whitespace name", req: joinRequest{Name: "   "}},
		{name: "unknown role", req: joinRequest{Name: "Ada", Role: "admin"}},
	} {
		t.Run("rejects "+tc.name, func(t *testing.T) {
			if _, _, err := validateJoin(tc.req); err == nil {
				t.Fatal("expected error, got nil")
			}
		})
	}
}

func TestPlanMove(t *testing.T) {
	const (
		core     = db.MembershipRoleCore
		guest    = db.MembershipRoleGuest
		active   = db.MembershipStatusActive
		inactive = db.MembershipStatusInactive
	)
	cases := []struct {
		name    string
		action  memberAction
		role    db.MembershipRole
		status  db.MembershipStatus
		want    membershipMove
		wantErr bool
	}{
		{name: "deactivate active core leaves the rotation", action: actionDeactivate, role: core, status: active, want: membershipMove{}},
		{name: "deactivate active guest", action: actionDeactivate, role: guest, status: active, want: membershipMove{}},
		{name: "deactivate inactive core is a no-op", action: actionDeactivate, role: core, status: inactive, want: membershipMove{noOp: true}},
		{name: "deactivate inactive guest is a no-op", action: actionDeactivate, role: guest, status: inactive, want: membershipMove{noOp: true}},
		{name: "reactivate inactive core re-enters the rotation seeded", action: actionReactivate, role: core, status: inactive, want: membershipMove{seed: true}},
		{name: "reactivate inactive guest stays out of the rotation", action: actionReactivate, role: guest, status: inactive, want: membershipMove{}},
		{name: "reactivate active core is a no-op", action: actionReactivate, role: core, status: active, want: membershipMove{noOp: true}},
		{name: "reactivate active guest is a no-op", action: actionReactivate, role: guest, status: active, want: membershipMove{noOp: true}},
		{name: "promote active guest enters the rotation seeded", action: actionPromote, role: guest, status: active, want: membershipMove{seed: true}},
		{name: "promote active core is a no-op", action: actionPromote, role: core, status: active, want: membershipMove{noOp: true}},
		{name: "promote inactive guest is rejected", action: actionPromote, role: guest, status: inactive, wantErr: true},
		{name: "promote inactive core is rejected", action: actionPromote, role: core, status: inactive, wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := planMove(tc.action, tc.role, tc.status)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("planMove = %+v, want error", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("planMove = %+v, want %+v", got, tc.want)
			}
		})
	}
}
