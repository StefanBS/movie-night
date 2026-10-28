-- +goose Up
-- +goose StatementBegin
-- A full Night: the picks row plus its movie's columns. It is the only place
-- that defines what reading a Night returns, so a new Night column is added
-- here (CREATE OR REPLACE VIEW, appended at the end) and nowhere else. Writes
-- go to picks; a join view is read-only.
CREATE VIEW nights AS
SELECT
  p.id, p.group_id, p.picker_id, p.is_credited, p.scheduled_for, p.created_at,
  p.start_time, p.remind_night_before, p.remind_morning_of, p.remind_two_hours_before,
  p.remind_audience,
  m.tmdb_id      AS movie_tmdb_id,
  m.title        AS movie_title,
  m.release_year AS movie_release_year,
  m.poster_path  AS movie_poster_path
FROM picks p
LEFT JOIN movies m ON m.id = p.movie_id;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP VIEW IF EXISTS nights;
-- +goose StatementEnd
