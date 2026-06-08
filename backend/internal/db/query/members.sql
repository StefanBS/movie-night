-- name: CreateUser :one
INSERT INTO users (name) VALUES ($1)
RETURNING id, name, letterboxd_user, created_at;

-- name: InsertMembership :one
INSERT INTO memberships (group_id, user_id, role, status, baseline_picks, rotation_position)
VALUES (sqlc.arg(group_id), sqlc.arg(user_id), sqlc.arg(role), sqlc.arg(status), sqlc.arg(baseline_picks), sqlc.arg(rotation_position))
RETURNING id, group_id, user_id, role, status, baseline_picks, rotation_position, joined_at, left_at;

-- name: GetGroupMember :one
SELECT u.id AS user_id, u.name, m.role, m.status, m.baseline_picks
FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE m.group_id = sqlc.arg(group_id) AND m.user_id = sqlc.arg(user_id);

-- name: DeactivateMembership :one
UPDATE memberships
SET status = 'inactive', left_at = now()
WHERE group_id = sqlc.arg(group_id) AND user_id = sqlc.arg(user_id)
RETURNING id, group_id, user_id, role, status, baseline_picks, rotation_position, joined_at, left_at;

-- name: ReactivateMembership :one
UPDATE memberships
SET status = 'active', left_at = NULL, baseline_picks = sqlc.arg(baseline_picks)
WHERE group_id = sqlc.arg(group_id) AND user_id = sqlc.arg(user_id)
RETURNING id, group_id, user_id, role, status, baseline_picks, rotation_position, joined_at, left_at;

-- name: PromoteMembership :one
UPDATE memberships
SET role = 'core', status = 'active', left_at = NULL,
    baseline_picks = sqlc.arg(baseline_picks), rotation_position = sqlc.arg(rotation_position)
WHERE group_id = sqlc.arg(group_id) AND user_id = sqlc.arg(user_id)
RETURNING id, group_id, user_id, role, status, baseline_picks, rotation_position, joined_at, left_at;

-- name: AverageServedCount :one
SELECT COALESCE(AVG(m.baseline_picks + COALESCE(p.cnt, 0)), 0)::float8 AS avg_served
FROM memberships m
LEFT JOIN (
  SELECT picker_id, COUNT(*) FILTER (WHERE is_credited) AS cnt
  FROM picks pk
  WHERE pk.group_id = sqlc.arg(group_id)
  GROUP BY picker_id
) p ON p.picker_id = m.user_id
WHERE m.group_id = sqlc.arg(group_id) AND m.status = 'active' AND m.role = 'core';

-- name: MemberCreditedCount :one
SELECT COALESCE(COUNT(*) FILTER (WHERE is_credited), 0)::int AS credited_count
FROM picks
WHERE group_id = sqlc.arg(group_id) AND picker_id = sqlc.arg(user_id);

-- name: MaxRotationPosition :one
SELECT COALESCE(MAX(rotation_position), 0)::int AS max_position
FROM memberships
WHERE group_id = sqlc.arg(group_id);
