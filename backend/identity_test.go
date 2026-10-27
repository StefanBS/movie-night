package main

import (
	"bytes"
	"testing"
)

func TestBearerToken(t *testing.T) {
	for _, tc := range []struct {
		name   string
		header string
		want   string
		wantOK bool
	}{
		{name: "bearer token", header: "Bearer abc123", want: "abc123", wantOK: true},
		{name: "scheme is case-insensitive", header: "bearer abc123", want: "abc123", wantOK: true},
		{name: "missing header", header: "", wantOK: false},
		{name: "other scheme", header: "Basic abc123", wantOK: false},
		{name: "scheme without token", header: "Bearer ", wantOK: false},
		{name: "scheme only", header: "Bearer", wantOK: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := bearerToken(tc.header)
			if ok != tc.wantOK || got != tc.want {
				t.Errorf("bearerToken(%q) = (%q, %v), want (%q, %v)", tc.header, got, ok, tc.want, tc.wantOK)
			}
		})
	}
}

func TestHashToken(t *testing.T) {
	if !bytes.Equal(hashToken("abc"), hashToken("abc")) {
		t.Error("same token hashed differently")
	}
	if bytes.Equal(hashToken("abc"), hashToken("abd")) {
		t.Error("different tokens hashed the same")
	}
}

func TestNewToken(t *testing.T) {
	a, err := newToken()
	if err != nil {
		t.Fatalf("newToken: %v", err)
	}
	b, err := newToken()
	if err != nil {
		t.Fatalf("newToken: %v", err)
	}
	if a == b {
		t.Error("two tokens are equal")
	}
	// 32 random bytes in unpadded base64url.
	if len(a) != 43 {
		t.Errorf("len(token) = %d, want 43", len(a))
	}
}
