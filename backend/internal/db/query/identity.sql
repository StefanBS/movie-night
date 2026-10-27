-- name: CreateDevice :one
INSERT INTO devices (user_id, token_hash)
VALUES (sqlc.arg(user_id), sqlc.arg(token_hash))
RETURNING id, user_id;

-- name: TouchDevice :one
-- Resolves a token hash to its identity and records that the device was seen;
-- no row means the token is unknown or was released.
UPDATE devices d
SET last_seen_at = now()
FROM users u
WHERE d.token_hash = sqlc.arg(token_hash) AND u.id = d.user_id
RETURNING u.id AS user_id, u.name, u.reminders_muted;

-- name: DeleteDevice :execrows
DELETE FROM devices WHERE token_hash = sqlc.arg(token_hash);

-- name: RegisterPush :execrows
-- Points the device's reminders at its push token and time zone. A push token
-- names one install, so it is taken off any other device row first (a
-- reinstall's orphaned row, say) so nobody gets a reminder twice or someone
-- else's. No row means the token is unknown or was released.
WITH me AS (
  SELECT d.id FROM devices d WHERE d.token_hash = sqlc.arg(token_hash)
), cleared AS (
  UPDATE devices o SET push_token = NULL
  WHERE o.push_token = sqlc.arg(push_token) AND o.id NOT IN (SELECT me.id FROM me)
)
UPDATE devices t
SET push_token = sqlc.arg(push_token), time_zone = sqlc.arg(time_zone), last_seen_at = now()
WHERE t.id IN (SELECT me.id FROM me);

-- name: SetRemindersMuted :one
-- Mutes or unmutes reminders for the device's identity; no row means the
-- token is unknown or was released.
UPDATE users u
SET reminders_muted = sqlc.arg(reminders_muted)
FROM devices d
WHERE d.token_hash = sqlc.arg(token_hash) AND u.id = d.user_id
RETURNING u.id AS user_id, u.name, u.reminders_muted;
