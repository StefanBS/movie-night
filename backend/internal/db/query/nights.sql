-- name: CreateNight :one
-- Inserts the night and its attendees in one statement, so a night never exists
-- without the attendees its picker is drawn from. Attendees must be deduped.
WITH night AS (
  INSERT INTO picks (group_id, scheduled_for, start_time, picker_id, is_credited)
  VALUES (sqlc.arg(group_id), sqlc.arg(scheduled_for), sqlc.arg(start_time), sqlc.arg(picker_id), sqlc.arg(is_credited))
  RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id,
            start_time, remind_night_before, remind_morning_of, remind_two_hours_before, remind_audience
), attended AS (
  INSERT INTO attendances (pick_id, user_id)
  SELECT night.id, unnest(sqlc.arg(attendees)::uuid[]) FROM night
)
SELECT
  night.id, night.group_id, night.picker_id, night.is_credited, night.scheduled_for, night.created_at,
  night.start_time, night.remind_night_before, night.remind_morning_of, night.remind_two_hours_before,
  night.remind_audience,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path
FROM night
LEFT JOIN movies m ON m.id = night.movie_id;

-- name: GetNight :one
-- Every night query returns this same shape (the night plus its movie's LEFT
-- JOIN columns), so one mapper builds every night response.
SELECT
  p.id, p.group_id, p.picker_id, p.is_credited, p.scheduled_for, p.created_at,
  p.start_time, p.remind_night_before, p.remind_morning_of, p.remind_two_hours_before,
  p.remind_audience,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path
FROM picks p
LEFT JOIN movies m ON m.id = p.movie_id
WHERE p.id = sqlc.arg(night_id) AND p.group_id = sqlc.arg(group_id);

-- name: GetNightForUpdate :one
-- Locks the night row for the rest of the edit transaction, so a concurrent
-- record-pick cannot move the picker between the picker check and the write.
SELECT
  p.id, p.group_id, p.picker_id, p.is_credited, p.scheduled_for, p.created_at,
  p.start_time, p.remind_night_before, p.remind_morning_of, p.remind_two_hours_before,
  p.remind_audience,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path
FROM picks p
LEFT JOIN movies m ON m.id = p.movie_id
WHERE p.id = sqlc.arg(night_id) AND p.group_id = sqlc.arg(group_id)
FOR UPDATE OF p;

-- name: RemoveAttendeesNotIn :exec
DELETE FROM attendances
WHERE pick_id = sqlc.arg(pick_id) AND NOT (user_id = ANY(sqlc.arg(keep)::uuid[]));

-- name: AddAttendees :exec
-- Adds each user who isn't attending yet; existing attendances are left as-is.
INSERT INTO attendances (pick_id, user_id)
SELECT sqlc.arg(pick_id), unnest(sqlc.arg(user_ids)::uuid[])
ON CONFLICT (pick_id, user_id) DO NOTHING;

-- name: ListNightAttendees :many
SELECT u.id, u.name, m.role
FROM attendances a
JOIN users u ON u.id = a.user_id
JOIN memberships m ON m.user_id = a.user_id AND m.group_id = sqlc.arg(group_id)
WHERE a.pick_id = sqlc.arg(night_id)
ORDER BY
  CASE WHEN m.role = 'core' THEN 0 ELSE 1 END,
  u.name;

-- name: SetNightPicker :one
WITH p AS (
  UPDATE picks
  SET picker_id = sqlc.arg(picker_id), is_credited = sqlc.arg(is_credited)
  WHERE picks.id = sqlc.arg(night_id) AND picks.group_id = sqlc.arg(group_id)
  RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id,
            start_time, remind_night_before, remind_morning_of, remind_two_hours_before, remind_audience
)
SELECT
  p.id, p.group_id, p.picker_id, p.is_credited, p.scheduled_for, p.created_at,
  p.start_time, p.remind_night_before, p.remind_morning_of, p.remind_two_hours_before,
  p.remind_audience,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path
FROM p
LEFT JOIN movies m ON m.id = p.movie_id;

-- name: ListNights :many
SELECT
  p.id, p.group_id, p.picker_id, p.is_credited, p.scheduled_for, p.created_at,
  p.start_time, p.remind_night_before, p.remind_morning_of, p.remind_two_hours_before,
  p.remind_audience,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path
FROM picks p
LEFT JOIN movies m ON m.id = p.movie_id
WHERE p.group_id = sqlc.arg(group_id)
ORDER BY p.scheduled_for DESC;

-- name: UpdateNightDate :one
WITH p AS (
  UPDATE picks
  SET scheduled_for = sqlc.arg(scheduled_for)
  WHERE picks.id = sqlc.arg(night_id) AND picks.group_id = sqlc.arg(group_id)
  RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id,
            start_time, remind_night_before, remind_morning_of, remind_two_hours_before, remind_audience
)
SELECT
  p.id, p.group_id, p.picker_id, p.is_credited, p.scheduled_for, p.created_at,
  p.start_time, p.remind_night_before, p.remind_morning_of, p.remind_two_hours_before,
  p.remind_audience,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path
FROM p
LEFT JOIN movies m ON m.id = p.movie_id;

-- name: UpdateNightStartTime :one
-- A NULL start_time clears it.
WITH p AS (
  UPDATE picks
  SET start_time = sqlc.narg(start_time)
  WHERE picks.id = sqlc.arg(night_id) AND picks.group_id = sqlc.arg(group_id)
  RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id,
            start_time, remind_night_before, remind_morning_of, remind_two_hours_before, remind_audience
)
SELECT
  p.id, p.group_id, p.picker_id, p.is_credited, p.scheduled_for, p.created_at,
  p.start_time, p.remind_night_before, p.remind_morning_of, p.remind_two_hours_before,
  p.remind_audience,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path
FROM p
LEFT JOIN movies m ON m.id = p.movie_id;

-- name: UpdateNightReminders :one
WITH p AS (
  UPDATE picks
  SET remind_night_before     = sqlc.arg(remind_night_before),
      remind_morning_of       = sqlc.arg(remind_morning_of),
      remind_two_hours_before = sqlc.arg(remind_two_hours_before),
      remind_audience         = sqlc.arg(remind_audience)
  WHERE picks.id = sqlc.arg(night_id) AND picks.group_id = sqlc.arg(group_id)
  RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id,
            start_time, remind_night_before, remind_morning_of, remind_two_hours_before, remind_audience
)
SELECT
  p.id, p.group_id, p.picker_id, p.is_credited, p.scheduled_for, p.created_at,
  p.start_time, p.remind_night_before, p.remind_morning_of, p.remind_two_hours_before,
  p.remind_audience,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path
FROM p
LEFT JOIN movies m ON m.id = p.movie_id;

-- name: DeleteNight :exec
DELETE FROM picks
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id);

-- name: ListNightsAttendees :many
SELECT a.pick_id, u.id, u.name, m.role
FROM attendances a
JOIN users u ON u.id = a.user_id
JOIN memberships m ON m.user_id = a.user_id AND m.group_id = sqlc.arg(group_id)
WHERE a.pick_id = ANY(sqlc.arg(night_ids)::uuid[])
ORDER BY
  CASE WHEN m.role = 'core' THEN 0 ELSE 1 END,
  u.name;
