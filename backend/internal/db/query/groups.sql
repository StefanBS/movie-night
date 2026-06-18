-- name: GetGroup :one
SELECT id, name, created_at FROM groups WHERE id = $1;

-- name: RenameGroup :one
UPDATE groups SET name = $2 WHERE id = $1
RETURNING id, name, created_at;
