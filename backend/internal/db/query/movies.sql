-- name: UpsertMovie :one
INSERT INTO movies (tmdb_id, title, release_year, poster_path)
VALUES (sqlc.arg(tmdb_id), sqlc.arg(title), sqlc.arg(release_year), sqlc.arg(poster_path))
ON CONFLICT (tmdb_id) DO UPDATE
    SET title = excluded.title, release_year = excluded.release_year,
        poster_path = excluded.poster_path, cached_at = now()
RETURNING id;

-- name: SetNightMovie :one
-- The movie must be written by an earlier statement (UpsertMovie): the outer
-- SELECT sees movies as they were when this statement began.
WITH p AS (
  UPDATE picks
  SET movie_id = sqlc.arg(movie_id)
  WHERE picks.id = sqlc.arg(night_id) AND picks.group_id = sqlc.arg(group_id)
  RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id,
            remind_night_before, remind_morning_of, remind_audience
)
SELECT
  p.id, p.group_id, p.picker_id, p.is_credited, p.scheduled_for, p.created_at,
  p.remind_night_before, p.remind_morning_of, p.remind_audience,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path
FROM p
LEFT JOIN movies m ON m.id = p.movie_id;

-- name: ClearNightMovie :one
WITH p AS (
  UPDATE picks
  SET movie_id = NULL
  WHERE picks.id = sqlc.arg(night_id) AND picks.group_id = sqlc.arg(group_id)
  RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id,
            remind_night_before, remind_morning_of, remind_audience
)
SELECT
  p.id, p.group_id, p.picker_id, p.is_credited, p.scheduled_for, p.created_at,
  p.remind_night_before, p.remind_morning_of, p.remind_audience,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path
FROM p
LEFT JOIN movies m ON m.id = p.movie_id;
