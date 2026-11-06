-- name: CreateUser :one
INSERT INTO users (name) VALUES ($1)
RETURNING id, name;

-- name: InsertMembership :one
INSERT INTO memberships (group_id, user_id, role, status, baseline_picks, rotation_position)
VALUES (sqlc.arg(group_id), sqlc.arg(user_id), sqlc.arg(role), sqlc.arg(status), sqlc.arg(baseline_picks), sqlc.arg(rotation_position))
RETURNING joined_at;

-- name: GetGroupMember :one
SELECT u.id AS user_id, u.name, u.reminders_muted, m.status
FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE m.group_id = sqlc.arg(group_id) AND m.user_id = sqlc.arg(user_id);

-- name: LockGroupMember :one
-- GetGroupMember for a membership change: locks the membership row for the
-- rest of the write's transaction, so the state planMove checks is the state
-- the change is written over.
SELECT u.id AS user_id, u.name, m.role, m.status, m.baseline_picks, m.rotation_position, m.joined_at
FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE m.group_id = sqlc.arg(group_id) AND m.user_id = sqlc.arg(user_id)
FOR UPDATE OF m;

-- name: FilterGroupMembers :many
-- The ids among user_ids that hold a membership in the group (active or
-- inactive), with their role; an id without one is simply absent.
SELECT user_id, role
FROM memberships
WHERE group_id = sqlc.arg(group_id) AND user_id = ANY(sqlc.arg(user_ids)::uuid[]);

-- name: UpdateMembership :exec
-- Writes the state planMove decided.
UPDATE memberships
SET role = sqlc.arg(role), status = sqlc.arg(status),
    baseline_picks = sqlc.arg(baseline_picks), rotation_position = sqlc.arg(rotation_position)
WHERE group_id = sqlc.arg(group_id) AND user_id = sqlc.arg(user_id);

-- name: RotationSeedInputs :one
-- Everything a member entering the rotation is seeded from, read at one point
-- in time: the active-core average served-count, the credited nights user_id
-- already has (0 for a user with no nights), and the highest rotation slot.
SELECT
  (SELECT COALESCE(AVG(m.baseline_picks + COALESCE(p.cnt, 0)), 0)
     FROM memberships m
     LEFT JOIN (
       SELECT picker_id, COUNT(*) FILTER (WHERE is_credited) AS cnt
       FROM nights pk
       WHERE pk.group_id = sqlc.arg(group_id)
       GROUP BY picker_id
     ) p ON p.picker_id = m.user_id
    WHERE m.group_id = sqlc.arg(group_id) AND m.status = 'active' AND m.role = 'core')::float8 AS avg_served,
  (SELECT COUNT(*) FILTER (WHERE c.is_credited)
     FROM nights c
    WHERE c.group_id = sqlc.arg(group_id) AND c.picker_id = sqlc.arg(user_id))::int AS credited_count,
  (SELECT COALESCE(MAX(r.rotation_position), 0)
     FROM memberships r
    WHERE r.group_id = sqlc.arg(group_id))::int AS max_position;
