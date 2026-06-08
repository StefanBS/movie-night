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

func TestValidateJoinName(t *testing.T) {
	t.Run("trims and accepts a real name", func(t *testing.T) {
		got, err := validateJoinName(joinRequest{Name: "  Ada  "})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != "Ada" {
			t.Errorf("name = %q, want %q", got, "Ada")
		}
	})
	for _, tc := range []struct{ name, in string }{
		{name: "empty", in: ""},
		{name: "whitespace only", in: "   "},
	} {
		t.Run("rejects "+tc.name, func(t *testing.T) {
			if _, err := validateJoinName(joinRequest{Name: tc.in}); err == nil {
				t.Fatal("expected error, got nil")
			}
		})
	}
}
