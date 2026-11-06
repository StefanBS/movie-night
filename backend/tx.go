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

// withTxResult is withTx for a write that hands back a value, such as the row
// it created.
func withTxResult[T any](ctx context.Context, pool *pgxpool.Pool, fn func(q *db.Queries) (T, error)) (T, error) {
	var out T
	err := withTx(ctx, pool, func(q *db.Queries) error {
		var err error
		out, err = fn(q)
		return err
	})
	return out, err
}
