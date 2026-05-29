package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseAllowedOrigins(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want []string
	}{
		{"empty string yields empty slice", "", []string{}},
		{"single origin", "http://localhost:8081", []string{"http://localhost:8081"}},
		{
			"comma-separated, trims surrounding whitespace",
			"http://localhost:8081, http://192.168.50.68:8081",
			[]string{"http://localhost:8081", "http://192.168.50.68:8081"},
		},
		{"drops empty segments", "http://a, ,http://b,", []string{"http://a", "http://b"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := parseAllowedOrigins(tc.raw)
			if len(got) != len(tc.want) {
				t.Fatalf("len = %d, want %d (%q)", len(got), len(tc.want), got)
			}
			for i := range tc.want {
				if got[i] != tc.want[i] {
					t.Errorf("[%d] = %q, want %q", i, got[i], tc.want[i])
				}
			}
		})
	}
}

func TestWithCORS(t *testing.T) {
	allowed := []string{"http://localhost:8081"}

	tests := []struct {
		name           string
		method         string
		origin         string
		wantStatus     int
		wantACAO       string // expected Access-Control-Allow-Origin ("" = header absent)
		wantNextCalled bool
	}{
		{
			name:           "allowed origin GET reflects origin and reaches the handler",
			method:         http.MethodGet,
			origin:         "http://localhost:8081",
			wantStatus:     http.StatusOK,
			wantACAO:       "http://localhost:8081",
			wantNextCalled: true,
		},
		{
			name:           "disallowed origin GET gets no CORS header but still reaches the handler",
			method:         http.MethodGet,
			origin:         "http://evil.example",
			wantStatus:     http.StatusOK,
			wantACAO:       "",
			wantNextCalled: true,
		},
		{
			name:           "no Origin (mobile app / curl) passes through untouched",
			method:         http.MethodGet,
			origin:         "",
			wantStatus:     http.StatusOK,
			wantACAO:       "",
			wantNextCalled: true,
		},
		{
			name:           "allowed origin preflight returns 204 without hitting the handler",
			method:         http.MethodOptions,
			origin:         "http://localhost:8081",
			wantStatus:     http.StatusNoContent,
			wantACAO:       "http://localhost:8081",
			wantNextCalled: false,
		},
		{
			name:           "disallowed origin preflight returns 204 with no CORS header",
			method:         http.MethodOptions,
			origin:         "http://evil.example",
			wantStatus:     http.StatusNoContent,
			wantACAO:       "",
			wantNextCalled: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			nextCalled := false
			next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				nextCalled = true
				w.WriteHeader(http.StatusOK)
			})

			req := httptest.NewRequest(tc.method, "/groups/x/members", nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			rec := httptest.NewRecorder()

			withCORS(allowed, next).ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Errorf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
			if got := rec.Header().Get("Access-Control-Allow-Origin"); got != tc.wantACAO {
				t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, tc.wantACAO)
			}
			if nextCalled != tc.wantNextCalled {
				t.Errorf("next called = %v, want %v", nextCalled, tc.wantNextCalled)
			}
			// Whenever we reflect an origin we must also vary on it, so a cache
			// can't hand one origin's response to another.
			if tc.wantACAO != "" && rec.Header().Get("Vary") != "Origin" {
				t.Errorf("Vary = %q, want %q", rec.Header().Get("Vary"), "Origin")
			}
		})
	}
}
