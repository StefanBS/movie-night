package main

import (
	"context"
	"embed"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// resetSQL empties every table (see reset.sql); seedSQL is the dev seed. Both
// are embedded so the binary resets exactly as `just reseed` does, and so are
// the fixtures a reseed can add on top of the seed (fixtures/*.sql).
var (
	//go:embed reset.sql
	resetSQL string
	//go:embed seed.sql
	seedSQL string
	//go:embed fixtures/*.sql
	fixtureFiles embed.FS
)

// seedAda is the seed's Ada (seed.sql): who a phone kept claimed across a
// reseed acts as, as the e2e flows' common/setup.yaml claims her.
const seedAda = "a0000000-0000-0000-0000-000000000001"

// keepDevicesSQL copies the devices out of the way of reset.sql (a temp table
// isn't in the public schema, so the reset leaves it), and restoreDevicesSQL
// puts them back as Ada once the seed is in. Users are reseeded under fixed
// ids, but whoever a device was (a guest a flow added, Blake after a switch)
// may not be, so every kept device becomes Ada.
const (
	keepDevicesSQL = `CREATE TEMP TABLE kept_devices AS
SELECT token_hash, push_token, time_zone, created_at FROM devices`
	restoreDevicesSQL = `INSERT INTO devices (user_id, token_hash, push_token, time_zone, created_at)
SELECT '` + seedAda + `', token_hash, push_token, time_zone, created_at FROM kept_devices`
)

// addDevRoutes registers the routes that exist only for local development and
// the e2e flows. main calls it only when DEV_RESET=1, which staging and prod
// never set, so there the routes 404.
func addDevRoutes(mux *http.ServeMux, pool *pgxpool.Pool) {
	mux.Handle("POST /dev/reseed", reseedHandler(pool))
}

// reseedRequest is what POST /dev/reseed's query asks for on top of the seed.
type reseedRequest struct {
	// fixtureSQL is fixtures/<fixture>.sql, empty for the bare seed.
	fixtureSQL string
	// today is the caller's local date (YYYY-MM-DD), the fixture's "tonight".
	// The database's CURRENT_DATE is UTC, a day behind just after midnight in
	// Europe.
	today string
	// claimed keeps the devices, as Ada, so a claimed phone stays claimed.
	claimed bool
}

// parseReseedRequest reads ?fixture=<name>&today=YYYY-MM-DD&claimed=1. A
// fixture needs today; claimed is independent of both.
func parseReseedRequest(r *http.Request) (reseedRequest, string) {
	q := r.URL.Query()
	req := reseedRequest{claimed: q.Get("claimed") == "1"}
	name := q.Get("fixture")
	if name == "" {
		return req, ""
	}
	// embed.FS refuses a path that isn't fs.ValidPath, so "../seed" can't
	// escape fixtures/.
	b, err := fixtureFiles.ReadFile("fixtures/" + name + ".sql")
	if err != nil {
		return req, "unknown fixture " + name
	}
	req.fixtureSQL = string(b)
	req.today = q.Get("today")
	if _, err := time.Parse(time.DateOnly, req.today); err != nil {
		return req, "fixture " + name + " needs today=YYYY-MM-DD"
	}
	return req, ""
}

// reseedHandler resets the database to exactly the dev seed, plus a fixture if
// one is asked for: what each e2e flow starts from
// (mobile/.maestro/common/open.yaml). It destroys all data, and every device
// unless claimed=1 keeps them.
func reseedHandler(pool *pgxpool.Pool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		req, problem := parseReseedRequest(r)
		if problem != "" {
			http.Error(w, problem, http.StatusBadRequest)
			return
		}
		if step, err := reseed(r.Context(), pool, req); err != nil {
			log.Printf("dev reseed: %s: %v", step, err) //#nosec G706 -- step is one of reseed's constant names; err is from Postgres running embedded SQL
			http.Error(w, step+" failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

// reseed runs the reseed's steps on one connection of its own, so the temp
// table and fixture.today setting it leaves behind close with it rather than
// going back to the pool. It returns the step that failed.
func reseed(ctx context.Context, pool *pgxpool.Pool, req reseedRequest) (string, error) {
	pc, err := pool.Acquire(ctx)
	if err != nil {
		return "connect", err
	}
	conn := pc.Hijack()
	defer func() { _ = conn.Close(context.Background()) }()

	// Without arguments pgx sends each as a simple query, so a multi-statement
	// script (seed.sql and each fixture run their own transaction) is allowed.
	exec := func(sql string, args ...any) error {
		_, err := conn.Exec(ctx, sql, args...)
		return err
	}
	if req.claimed {
		if err := exec(keepDevicesSQL); err != nil {
			return "keep devices", err
		}
	}
	if err := exec(resetSQL); err != nil {
		return "reset", err
	}
	if err := exec(seedSQL); err != nil {
		return "seed", err
	}
	if req.fixtureSQL != "" {
		if err := exec("SELECT set_config('fixture.today', $1, false)", req.today); err != nil {
			return "set today", err
		}
		if err := exec(req.fixtureSQL); err != nil {
			return "fixture", err
		}
	}
	if req.claimed {
		if err := exec(restoreDevicesSQL); err != nil {
			return "restore devices", err
		}
	}
	return "", nil
}
