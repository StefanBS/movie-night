-- name: CreateNight :one
INSERT INTO picks (group_id, scheduled_for)
VALUES (sqlc.arg(group_id), sqlc.arg(scheduled_for))
RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id;

-- name: GetNight :one
SELECT id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id
FROM picks
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id);

-- name: GetCurrentNight :one
SELECT id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id
FROM picks
WHERE group_id = sqlc.arg(group_id)
ORDER BY scheduled_for DESC, created_at DESC
LIMIT 1;

-- name: GetOpenNight :one
SELECT id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id
FROM picks
WHERE group_id = sqlc.arg(group_id) AND picker_id IS NULL
ORDER BY scheduled_for DESC, created_at DESC
LIMIT 1;

-- name: AddAttendee :exec
INSERT INTO attendances (pick_id, user_id)
VALUES (sqlc.arg(pick_id), sqlc.arg(user_id))
ON CONFLICT (pick_id, user_id) DO NOTHING;

-- name: RemoveAttendee :exec
DELETE FROM attendances
WHERE pick_id = sqlc.arg(pick_id) AND user_id = sqlc.arg(user_id);

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
UPDATE picks
SET picker_id = sqlc.arg(picker_id), is_credited = sqlc.arg(is_credited)
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id)
RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at, movie_id;

-- name: ListRecordedNights :many
SELECT
  p.id, p.group_id, p.picker_id, p.is_credited, p.scheduled_for, p.created_at, p.movie_id,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path
FROM picks p
LEFT JOIN movies m ON m.id = p.movie_id
WHERE p.group_id = sqlc.arg(group_id) AND p.picker_id IS NOT NULL
ORDER BY p.scheduled_for DESC, p.created_at DESC;

-- name: ListNightsAttendees :many
SELECT a.pick_id, u.id, u.name, m.role
FROM attendances a
JOIN users u ON u.id = a.user_id
JOIN memberships m ON m.user_id = a.user_id AND m.group_id = sqlc.arg(group_id)
WHERE a.pick_id = ANY(sqlc.arg(night_ids)::uuid[])
ORDER BY
  CASE WHEN m.role = 'core' THEN 0 ELSE 1 END,
  u.name;
