-- name: RankGroupTurn :many
-- exclude_night (nullable) drops that night's own pick from the counts, so
-- ranking a night reflects standings as if it were still undecided. sqlc
-- can't see a function's result columns: the alias list names them and the
-- casts type them.
SELECT u.id, u.name, m.role, s.served_count::int AS served_count, s.last_picked_on::date AS last_picked_on
FROM served_counts(sqlc.arg(group_id), sqlc.narg(exclude_night)::uuid) AS s(user_id, served_count, last_picked_on)
JOIN memberships m ON m.group_id = sqlc.arg(group_id) AND m.user_id = s.user_id
JOIN users u ON u.id = s.user_id
WHERE sqlc.narg(present)::uuid[] IS NULL OR u.id = ANY(sqlc.narg(present)::uuid[])
ORDER BY s.served_count ASC, s.last_picked_on ASC NULLS FIRST, m.rotation_position ASC;
