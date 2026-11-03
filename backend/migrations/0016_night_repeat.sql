-- +goose Up
-- +goose StatementBegin
-- A Night's repeat (ADR-0014). The rule rides on one Night at a time:
-- recording that Night as watched, or cancelling it, opens the next Night in
-- the series and moves the rule onto it. Weekly repeats every 1 or 2 weeks on
-- the Night's weekday; monthly on the Nth (1–4) of that weekday, or the last
-- (-1). All NULL is a Night that doesn't repeat.
CREATE TYPE repeat_freq AS ENUM ('weekly', 'monthly');
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE picks
    ADD COLUMN repeat_freq           repeat_freq NULL,
    ADD COLUMN repeat_interval_weeks smallint    NULL,
    ADD COLUMN repeat_week_of_month  smallint    NULL,
    ADD CONSTRAINT ck_pick_repeat CHECK (
        (repeat_freq IS NULL AND repeat_interval_weeks IS NULL AND repeat_week_of_month IS NULL)
        OR (repeat_freq = 'weekly' AND repeat_interval_weeks IN (1, 2) AND repeat_week_of_month IS NULL)
        OR (repeat_freq = 'monthly' AND repeat_interval_weeks IS NULL AND repeat_week_of_month IN (1, 2, 3, 4, -1))
    );
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
  p.watched_at,
  p.repeat_freq, p.repeat_interval_weeks, p.repeat_week_of_month
FROM picks p
LEFT JOIN movies m ON m.id = p.movie_id;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- CREATE OR REPLACE VIEW can't drop columns, so the view is rebuilt as 0015 had it.
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
  m.runtime_minutes AS movie_runtime_minutes,
  p.watched_at
FROM picks p
LEFT JOIN movies m ON m.id = p.movie_id;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE picks
    DROP CONSTRAINT IF EXISTS ck_pick_repeat,
    DROP COLUMN IF EXISTS repeat_freq,
    DROP COLUMN IF EXISTS repeat_interval_weeks,
    DROP COLUMN IF EXISTS repeat_week_of_month;
DROP TYPE IF EXISTS repeat_freq;
-- +goose StatementEnd
