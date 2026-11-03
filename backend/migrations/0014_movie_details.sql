-- +goose Up
-- +goose StatementBegin
-- A movie's TMDB genre names (in TMDB order) and running time in minutes,
-- fetched with the rest of its details when it is attached. Movies cached
-- before this get no genres and an unknown runtime until re-attached.
ALTER TABLE movies
    ADD COLUMN genres          text[] NOT NULL DEFAULT '{}',
    ADD COLUMN runtime_minutes integer NULL;
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
  m.runtime_minutes AS movie_runtime_minutes
FROM picks p
LEFT JOIN movies m ON m.id = p.movie_id;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- CREATE OR REPLACE VIEW can't drop columns, so the view is rebuilt as 0013 had it.
DROP VIEW IF EXISTS nights;
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

-- +goose StatementBegin
ALTER TABLE movies
    DROP COLUMN IF EXISTS genres,
    DROP COLUMN IF EXISTS runtime_minutes;
-- +goose StatementEnd
