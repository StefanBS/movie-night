-- name: UpsertMovie :one
INSERT INTO movies (tmdb_id, title, release_year, poster_path, genres, runtime_minutes)
VALUES (sqlc.arg(tmdb_id), sqlc.arg(title), sqlc.arg(release_year), sqlc.arg(poster_path),
        sqlc.arg(genres), sqlc.arg(runtime_minutes))
ON CONFLICT (tmdb_id) DO UPDATE
    SET title = excluded.title, release_year = excluded.release_year,
        poster_path = excluded.poster_path, genres = excluded.genres,
        runtime_minutes = excluded.runtime_minutes
RETURNING id;

-- name: SetNightMovie :exec
UPDATE nights
SET movie_id = sqlc.arg(movie_id)
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id);

-- name: ClearNightMovie :one
-- RETURNING the id lets a missing night surface as no rows (404).
UPDATE nights
SET movie_id = NULL
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id)
RETURNING id;
