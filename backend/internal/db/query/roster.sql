-- name: ListGroupMembers :many
SELECT u.id, u.name, m.role
FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE m.group_id = $1
  AND m.status = 'active'
ORDER BY m.rotation_position, u.name;
