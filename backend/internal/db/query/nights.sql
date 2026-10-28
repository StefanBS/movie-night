-- Night writes change picks/attendances and return at most the Night's id; the
-- response is read back through the nights view (GetNight), the one definition
-- of a full Night.

-- name: CreateNight :one
-- Inserts the night and its attendees in one statement, so a night never exists
-- without the attendees its picker is drawn from. Attendees must be deduped.
WITH night AS (
  INSERT INTO picks (group_id, scheduled_for, start_time, picker_id, is_credited)
  VALUES (sqlc.arg(group_id), sqlc.arg(scheduled_for), sqlc.arg(start_time), sqlc.arg(picker_id), sqlc.arg(is_credited))
  RETURNING id
), attended AS (
  INSERT INTO attendances (pick_id, user_id)
  SELECT night.id, unnest(sqlc.arg(attendees)::uuid[]) FROM night
)
SELECT id FROM night;

-- name: GetNight :one
SELECT * FROM nights
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id);

-- name: ListNights :many
SELECT * FROM nights
WHERE group_id = sqlc.arg(group_id)
ORDER BY scheduled_for DESC;

-- name: LockNight :one
-- Locks the night row for the rest of the write's transaction and returns its
-- picker, so no other write can change the picker or attendees until it commits.
SELECT picker_id FROM picks
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id)
FOR UPDATE;

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

-- name: SetNightPicker :exec
UPDATE picks
SET picker_id = sqlc.arg(picker_id), is_credited = sqlc.arg(is_credited)
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id);

-- name: UpdateNight :exec
-- Replaces every editable field at once. A NULL start_time clears it.
UPDATE picks
SET scheduled_for           = sqlc.arg(scheduled_for),
    start_time              = sqlc.narg(start_time),
    remind_night_before     = sqlc.arg(remind_night_before),
    remind_morning_of       = sqlc.arg(remind_morning_of),
    remind_two_hours_before = sqlc.arg(remind_two_hours_before),
    remind_audience         = sqlc.arg(remind_audience)
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id);

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
