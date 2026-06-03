-- name: InsertPick :one
INSERT INTO picks (group_id, picker_id, is_credited, scheduled_for)
VALUES (sqlc.arg(group_id), sqlc.arg(picker_id), sqlc.arg(is_credited), sqlc.arg(scheduled_for))
RETURNING id, group_id, picker_id, is_credited, scheduled_for, created_at;
