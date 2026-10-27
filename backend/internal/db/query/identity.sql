-- name: CreateDevice :one
INSERT INTO devices (user_id, token_hash)
VALUES (sqlc.arg(user_id), sqlc.arg(token_hash))
RETURNING id, user_id, token_hash, created_at, last_seen_at;

-- name: TouchDevice :one
-- Resolves a token hash to its identity and records that the device was seen;
-- no row means the token is unknown or was released.
UPDATE devices d
SET last_seen_at = now()
FROM users u
WHERE d.token_hash = sqlc.arg(token_hash) AND u.id = d.user_id
RETURNING u.id AS user_id, u.name;

-- name: DeleteDevice :execrows
DELETE FROM devices WHERE token_hash = sqlc.arg(token_hash);
