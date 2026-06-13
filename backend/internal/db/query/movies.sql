-- name: UpsertMovie :one
INSERT INTO movies (tmdb_id, title, release_year)
VALUES (sqlc.arg(tmdb_id), sqlc.arg(title), sqlc.arg(release_year))
ON CONFLICT (tmdb_id) DO UPDATE
    SET title = excluded.title, release_year = excluded.release_year, cached_at = now()
RETURNING id, tmdb_id, title, release_year, cached_at;

-- name: GetMovie :one
SELECT id, tmdb_id, title, release_year, cached_at
FROM movies
WHERE id = sqlc.arg(id);

-- name: SetNightMovie :one
UPDATE picks
SET movie_id = sqlc.arg(movie_id)
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id)
RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id;
