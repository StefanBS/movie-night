package main

import "testing"

func TestValidateGroupName(t *testing.T) {
	t.Run("trims surrounding whitespace", func(t *testing.T) {
		name, err := validateGroupName("  Friday Film Club  ")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if name != "Friday Film Club" {
			t.Errorf("name = %q, want %q", name, "Friday Film Club")
		}
	})
	t.Run("rejects a whitespace-only name", func(t *testing.T) {
		if _, err := validateGroupName("   "); err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}
