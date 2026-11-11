//go:build !dev

package main

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

// devBuild: this binary was built without -tags dev, as a release build is, so
// it has no dev routes (devreset.go isn't in it): DEV_RESET=1 can't add POST
// /dev/reseed to a deployed server.
const devBuild = false

// addDevRoutes is never called here (devRoutes checks devBuild first); it
// exists so main compiles without devreset.go.
func addDevRoutes(*http.ServeMux, *pgxpool.Pool) {}
