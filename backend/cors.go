package main

import (
	"net/http"
	"strings"
)

// parseAllowedOrigins splits a comma-separated CORS_ALLOWED_ORIGINS value into a
// clean list, trimming whitespace and dropping empty segments. It always returns
// a non-nil slice.
func parseAllowedOrigins(raw string) []string {
	out := []string{}
	for part := range strings.SplitSeq(raw, ",") {
		if o := strings.TrimSpace(part); o != "" {
			out = append(out, o)
		}
	}
	return out
}

// withCORS wraps next with CORS handling for browser clients. Requests with no
// Origin header (the mobile app, curl, server-to-server) pass through untouched.
// When a request's Origin is in allowed, it reflects that origin and answers
// preflight OPTIONS requests with 204; an Origin that isn't allowed simply gets
// no CORS header, so the browser blocks it.
func withCORS(allowed []string, next http.Handler) http.Handler {
	allowedSet := make(map[string]bool, len(allowed))
	for _, o := range allowed {
		allowedSet[o] = true
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		permitted := origin != "" && allowedSet[origin]

		if permitted {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
		}

		// Short-circuit browser preflight requests: they carry no body and must
		// not be routed to a real handler.
		if r.Method == http.MethodOptions && origin != "" {
			if permitted {
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
