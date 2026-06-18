package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	// Cancel the base context on SIGINT/SIGTERM so both startup and the run
	// loop observe shutdown signals.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("create connection pool: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("connect to database: %v", err)
	}

	queries := db.New(pool)

	tmdb := newTMDBClient(os.Getenv("TMDB_READ_TOKEN"))
	if tmdb == nil {
		log.Print("TMDB not configured (TMDB_READ_TOKEN unset); /movies/search and attach return 503")
	} else {
		log.Print("TMDB configured")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.Handle("GET /groups/{groupId}/members", membersHandler(queries))
	mux.Handle("GET /groups/{groupId}/turn", turnHandler(queries))
	mux.Handle("POST /groups/{groupId}/members", joinMemberHandler(queries))
	mux.Handle("POST /groups/{groupId}/members/{userId}/deactivate", deactivateMemberHandler(queries))
	mux.Handle("POST /groups/{groupId}/members/{userId}/reactivate", reactivateMemberHandler(queries))
	mux.Handle("POST /groups/{groupId}/members/{userId}/promote", promoteMemberHandler(queries))
	mux.Handle("POST /groups/{groupId}/nights", createNightHandler(queries))
	mux.Handle("GET /groups/{groupId}/nights", listNightsHandler(queries))
	mux.Handle("GET /groups/{groupId}/nights/current", currentNightHandler(queries))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}", nightDetailHandler(queries))
	mux.Handle("GET /groups/{groupId}/nights/{nightId}/turn", nightTurnHandler(queries))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/attendees", addAttendeeHandler(queries))
	mux.Handle("DELETE /groups/{groupId}/nights/{nightId}/attendees/{userId}", removeAttendeeHandler(queries))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/pick", recordNightPickHandler(queries))
	mux.Handle("GET /movies/search", searchMoviesHandler(tmdb))
	mux.Handle("POST /groups/{groupId}/nights/{nightId}/movie", recordNightMovieHandler(queries, tmdb))

	// Browsers enforce CORS; native apps and curl do not. Allowed web origins
	// come from CORS_ALLOWED_ORIGINS (comma-separated) so the policy is the same
	// mechanism in dev, CI, and prod — only the value differs.
	allowedOrigins := parseAllowedOrigins(os.Getenv("CORS_ALLOWED_ORIGINS"))
	log.Printf("CORS allowed origins: %v", allowedOrigins)

	srv := &http.Server{
		Addr:         ":8080",
		Handler:      withCORS(allowedOrigins, mux),
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Serve in the background; ListenAndServe blocks until Shutdown is called.
	go func() {
		log.Printf("movie-night backend listening on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Wait for a shutdown signal, then drain in-flight requests before the
	// deferred pool.Close runs.
	<-ctx.Done()
	stop() // restore default signal handling so a second Ctrl-C force-quits
	log.Println("shutdown signal received; draining connections")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}
