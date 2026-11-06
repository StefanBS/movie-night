-- name: ListReminderCandidates :many
-- Every device that could get a reminder for a Night dated in the window: one
-- row per attendee device with a push token, for attendees whose membership is
-- active and who haven't muted reminders. Which slot is due, and whether this
-- person gets it, is decided in Go against each device's time zone.
SELECT
  n.id AS night_id, n.scheduled_for, n.start_time, n.picker_id,
  n.remind_night_before, n.remind_morning_of, n.remind_two_hours_before, n.remind_audience,
  g.name AS group_name,
  pu.name AS picker_name,
  (SELECT count(*) FROM attendances c WHERE c.night_id = n.id)::int AS going,
  a.user_id, d.push_token::text AS push_token, d.time_zone::text AS time_zone
FROM nights n
JOIN groups g ON g.id = n.group_id
JOIN users pu ON pu.id = n.picker_id
JOIN attendances a ON a.night_id = n.id
JOIN memberships m ON m.group_id = n.group_id AND m.user_id = a.user_id AND m.status = 'active'
JOIN users u ON u.id = a.user_id AND NOT u.reminders_muted
JOIN devices d ON d.user_id = a.user_id AND d.push_token IS NOT NULL AND d.time_zone IS NOT NULL
WHERE n.scheduled_for BETWEEN sqlc.arg(from_date) AND sqlc.arg(to_date)
ORDER BY n.id, a.user_id, d.id;

-- name: LogReminderSent :execrows
-- Claims a (night, person, slot) reminder for sending; 0 rows means it was
-- already sent.
INSERT INTO reminders_sent (night_id, user_id, slot)
VALUES (sqlc.arg(night_id), sqlc.arg(user_id), sqlc.arg(slot))
ON CONFLICT DO NOTHING;

-- name: ClearPushToken :exec
-- Expo reported the token as no longer registered; stop sending to it.
UPDATE devices SET push_token = NULL WHERE push_token = sqlc.arg(push_token);
