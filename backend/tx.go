package main

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// withTx runs fn against queries bound to one transaction: it commits when fn
// returns nil and rolls back on any error, which it returns unchanged so the
// caller can map it to a status. Single-statement writes don't need it.
func withTx(ctx context.Context, pool *pgxpool.Pool, fn func(q *db.Queries) error) error {
	return pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		return fn(db.New(tx))
	})
}
