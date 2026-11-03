-- Night writes change picks/attendances and return at most the Night's id; the
-- response is read back through the nights view (GetNight), the one definition
-- of a full Night.

-- name: CreateNight :one
-- Inserts the night and its attendees in one statement, so a night never exists
-- without the attendees its picker is drawn from. Attendees must be deduped.
WITH night AS (
  INSERT INTO picks (group_id, scheduled_for, start_time, picker_id, is_credited,
                     repeat_freq, repeat_interval_weeks, repeat_week_of_month)
  VALUES (sqlc.arg(group_id), sqlc.arg(scheduled_for), sqlc.arg(start_time), sqlc.arg(picker_id), sqlc.arg(is_credited),
          sqlc.narg(repeat_freq), sqlc.narg(repeat_interval_weeks), sqlc.narg(repeat_week_of_month))
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
-- picker, whether it has a film, whether it is recorded as watched, and its
-- date and repeat, so no other write can change them or the attendees until it
-- commits.
SELECT picker_id,
       (movie_id IS NOT NULL)::boolean AS has_movie,
       (watched_at IS NOT NULL)::boolean AS is_watched,
       scheduled_for, repeat_freq, repeat_interval_weeks, repeat_week_of_month
FROM picks
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
-- Replaces every editable field at once. A NULL start_time clears it, and
-- NULL repeat columns end the series.
UPDATE picks
SET scheduled_for           = sqlc.arg(scheduled_for),
    start_time              = sqlc.narg(start_time),
    remind_night_before     = sqlc.arg(remind_night_before),
    remind_morning_of       = sqlc.arg(remind_morning_of),
    remind_two_hours_before = sqlc.arg(remind_two_hours_before),
    remind_audience         = sqlc.arg(remind_audience),
    repeat_freq             = sqlc.narg(repeat_freq),
    repeat_interval_weeks   = sqlc.narg(repeat_interval_weeks),
    repeat_week_of_month    = sqlc.narg(repeat_week_of_month)
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id);

-- name: RecordNightWatched :exec
-- Records the night as watched (ADR-0012). Recording again keeps the first
-- watched_at.
UPDATE picks
SET watched_at = COALESCE(watched_at, now())
WHERE id = sqlc.arg(night_id) AND group_id = sqlc.arg(group_id);

-- name: LockNightOnDate :one
-- Locks the group's Night on a date, if there is one, for a series moving on
-- to that date (ADR-0014).
SELECT id, (watched_at IS NOT NULL)::boolean AS is_watched FROM picks
WHERE group_id = sqlc.arg(group_id) AND scheduled_for = sqlc.arg(scheduled_for)
FOR UPDATE;

-- name: CreateNextInSeries :one
-- Opens the next Night of a series (ADR-0014) from the Night it moves on from:
-- its start time, reminders, repeat and attendees, on the new date with the
-- given picker and no film. Attendances are read as the transaction left them.
WITH night AS (
  INSERT INTO picks (group_id, scheduled_for, start_time, picker_id, is_credited,
                     remind_night_before, remind_morning_of, remind_two_hours_before, remind_audience,
                     repeat_freq, repeat_interval_weeks, repeat_week_of_month)
  SELECT src.group_id, sqlc.arg(scheduled_for), src.start_time, sqlc.arg(picker_id), sqlc.arg(is_credited),
         src.remind_night_before, src.remind_morning_of, src.remind_two_hours_before, src.remind_audience,
         src.repeat_freq, src.repeat_interval_weeks, src.repeat_week_of_month
  FROM picks AS src
  WHERE src.id = sqlc.arg(from_night) AND src.group_id = sqlc.arg(group_id)
  RETURNING id
), attended AS (
  INSERT INTO attendances (pick_id, user_id)
  SELECT night.id, a.user_id FROM night, attendances a WHERE a.pick_id = sqlc.arg(from_night)
)
SELECT id FROM night;

-- name: JoinSeries :exec
-- Hands a series' repeat to a Night already on its next date, unless that
-- Night repeats on its own (ADR-0014).
UPDATE picks AS t
SET repeat_freq           = s.repeat_freq,
    repeat_interval_weeks = s.repeat_interval_weeks,
    repeat_week_of_month  = s.repeat_week_of_month
FROM picks AS s
WHERE t.id = sqlc.arg(night_id) AND t.group_id = sqlc.arg(group_id)
  AND s.id = sqlc.arg(from_night) AND s.group_id = sqlc.arg(group_id)
  AND t.repeat_freq IS NULL;

-- name: ClearNightRepeat :exec
UPDATE picks
SET repeat_freq = NULL, repeat_interval_weeks = NULL, repeat_week_of_month = NULL
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
