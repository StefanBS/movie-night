//go:build !dev

package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// A build without -tags dev, as a release build is, has no POST /dev/reseed
// even with DEV_RESET=1 set.
func TestReleaseBuildHasNoDevReseed(t *testing.T) {
	mux := http.NewServeMux()
	if msg := devRoutes(mux, nil, true); msg == "" {
		t.Error("devRoutes logs nothing, want it to say DEV_RESET=1 is ignored")
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/dev/reseed", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("POST /dev/reseed = %d, want 404", rec.Code)
	}
}
