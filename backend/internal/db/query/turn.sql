-- name: RankGroupTurn :many
SELECT u.id, u.name, m.role,
       (m.baseline_picks + COALESCE(p.credited_count, 0))::int AS served_count,
       p.last_picked_on
FROM memberships m
JOIN users u ON u.id = m.user_id
LEFT JOIN (
  SELECT picker_id,
         COUNT(*) FILTER (WHERE is_credited)           AS credited_count,
         MAX(scheduled_for) FILTER (WHERE is_credited)::date AS last_picked_on
  FROM picks
  WHERE picks.group_id = sqlc.arg(group_id)
  GROUP BY picker_id
) p ON p.picker_id = m.user_id
WHERE m.group_id = sqlc.arg(group_id)
  AND m.status = 'active'
  AND m.role = 'core'
  AND (sqlc.narg(present)::uuid[] IS NULL OR u.id = ANY(sqlc.narg(present)::uuid[]))
ORDER BY served_count ASC, last_picked_on ASC NULLS FIRST, m.rotation_position ASC;
