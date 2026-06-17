package main

import "testing"

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
