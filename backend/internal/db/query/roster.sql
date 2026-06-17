-- name: ListGroupMembers :many
SELECT u.id, u.name, m.role, m.status, m.joined_at
FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE m.group_id = $1
ORDER BY
  CASE
    WHEN m.status = 'active' AND m.role = 'core'  THEN 0
    WHEN m.status = 'active' AND m.role = 'guest' THEN 1
    ELSE 2
  END,
  m.rotation_position,
  u.name;
