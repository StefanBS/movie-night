package main

import (
	_ "embed"
	"log"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

// resetSQL empties every table (see reset.sql); seedSQL is the dev seed. Both
// are embedded so the binary resets exactly as `just reseed` does.
var (
	//go:embed reset.sql
	resetSQL string
	//go:embed seed.sql
	seedSQL string
)

// addDevRoutes registers the routes that exist only for local development and
// the e2e flows. main calls it only when DEV_RESET=1, which staging and prod
// never set, so there the routes 404.
func addDevRoutes(mux *http.ServeMux, pool *pgxpool.Pool) {
	mux.Handle("POST /dev/reseed", reseedHandler(pool))
}

// reseedHandler resets the database to exactly the dev seed: what each e2e
// flow starts from (mobile/.maestro/common/open.yaml). It destroys all data.
func reseedHandler(pool *pgxpool.Pool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		// No arguments, so pgx sends each as a simple query: a multi-statement
		// script (seed.sql runs its own transaction) is allowed.
		if _, err := pool.Exec(ctx, resetSQL); err != nil {
			log.Printf("dev reseed: reset: %v", err)
			http.Error(w, "reset failed", http.StatusInternalServerError)
			return
		}
		if _, err := pool.Exec(ctx, seedSQL); err != nil {
			log.Printf("dev reseed: seed: %v", err)
			http.Error(w, "seed failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}
