-- +goose Up
-- +goose StatementBegin
-- When the group recorded the Night as watched ("We watched it", ADR-0012);
-- NULL until then. Every Night already dated before today is history the app
-- showed as watched, so it is backfilled. The server has no group timezone
-- (ADR-0011), so a Night dated yesterday in some zones may be backfilled a
-- day early; acceptable for a one-off.
ALTER TABLE picks ADD COLUMN watched_at timestamptz NULL;
UPDATE picks SET watched_at = now() WHERE scheduled_for < CURRENT_DATE;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE VIEW nights AS
SELECT
  p.id, p.group_id, p.picker_id, p.is_credited, p.scheduled_for, p.created_at,
  p.start_time, p.remind_night_before, p.remind_morning_of, p.remind_two_hours_before,
  p.remind_audience,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path,
  m.genres          AS movie_genres,
  m.runtime_minutes AS movie_runtime_minutes,
  p.watched_at
FROM picks p
LEFT JOIN movies m ON m.id = p.movie_id;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- CREATE OR REPLACE VIEW can't drop columns, so the view is rebuilt as 0014 had it.
DROP VIEW IF EXISTS nights;
CREATE VIEW nights AS
SELECT
  p.id, p.group_id, p.picker_id, p.is_credited, p.scheduled_for, p.created_at,
  p.start_time, p.remind_night_before, p.remind_morning_of, p.remind_two_hours_before,
  p.remind_audience,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path,
  m.genres          AS movie_genres,
  m.runtime_minutes AS movie_runtime_minutes
FROM picks p
LEFT JOIN movies m ON m.id = p.movie_id;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE picks DROP COLUMN IF EXISTS watched_at;
-- +goose StatementEnd
