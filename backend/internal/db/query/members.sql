-- name: CreateUser :one
INSERT INTO users (name) VALUES ($1)
RETURNING id, name, letterboxd_user, created_at;

-- name: InsertMembership :one
INSERT INTO memberships (group_id, user_id, role, status, baseline_picks, rotation_position)
VALUES (sqlc.arg(group_id), sqlc.arg(user_id), sqlc.arg(role), sqlc.arg(status), sqlc.arg(baseline_picks), sqlc.arg(rotation_position))
RETURNING id, group_id, user_id, role, status, baseline_picks, rotation_position, joined_at, left_at;

-- name: GetGroupMember :one
SELECT u.id AS user_id, u.name, m.role, m.status, m.baseline_picks, m.joined_at
FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE m.group_id = sqlc.arg(group_id) AND m.user_id = sqlc.arg(user_id);

-- name: FilterGroupMembers :many
-- The ids among user_ids that hold a membership in the group (active or
-- inactive), with their role; an id without one is simply absent.
SELECT user_id, role
FROM memberships
WHERE group_id = sqlc.arg(group_id) AND user_id = ANY(sqlc.arg(user_ids)::uuid[]);

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

-- name: RotationSeedInputs :one
-- Everything a member entering the rotation is seeded from, read at one point
-- in time: the active-core average served-count, the credited picks user_id
-- already has (0 for a user with no picks), and the highest rotation slot.
SELECT
  (SELECT COALESCE(AVG(m.baseline_picks + COALESCE(p.cnt, 0)), 0)
     FROM memberships m
     LEFT JOIN (
       SELECT picker_id, COUNT(*) FILTER (WHERE is_credited) AS cnt
       FROM picks pk
       WHERE pk.group_id = sqlc.arg(group_id)
       GROUP BY picker_id
     ) p ON p.picker_id = m.user_id
    WHERE m.group_id = sqlc.arg(group_id) AND m.status = 'active' AND m.role = 'core')::float8 AS avg_served,
  (SELECT COUNT(*) FILTER (WHERE c.is_credited)
     FROM picks c
    WHERE c.group_id = sqlc.arg(group_id) AND c.picker_id = sqlc.arg(user_id))::int AS credited_count,
  (SELECT COALESCE(MAX(r.rotation_position), 0)
     FROM memberships r
    WHERE r.group_id = sqlc.arg(group_id))::int AS max_position;
