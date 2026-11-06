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

-- name: ClearNightMovie :exec
UPDATE nights
SET movie_id = NULL
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id);

-- name: GroupWatchedOn :many
-- For each of the given films the group has recorded as watched, the date of
-- the latest Night that watched it. except_night (nullable) leaves out the
-- Night whose film is being chosen, so its own film doesn't count.
SELECT m.tmdb_id, max(n.scheduled_for)::date AS watched_on
FROM nights n
JOIN movies m ON m.id = n.movie_id
WHERE n.group_id = sqlc.arg(group_id)
  AND n.watched_at IS NOT NULL
  AND m.tmdb_id = ANY(sqlc.arg(tmdb_ids)::int[])
  AND (sqlc.narg(except_night)::uuid IS NULL OR n.id <> sqlc.narg(except_night)::uuid)
GROUP BY m.tmdb_id;
