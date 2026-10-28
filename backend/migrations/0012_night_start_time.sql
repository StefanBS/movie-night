-- +goose Up
-- +goose StatementBegin
-- A Night's optional start time (ADR-0011): a time of day with no zone, read
-- on each device's own clock. Existing Nights get none. The 2-hours-before
-- reminder defaults to on but only fires on a Night with a start time.
ALTER TABLE picks
    ADD COLUMN start_time               time,
    ADD COLUMN remind_two_hours_before  boolean NOT NULL DEFAULT true;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TYPE reminder_slot ADD VALUE 'two_hours_before';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Postgres can't drop an enum value, so the type is rebuilt without it.
DELETE FROM reminders_sent WHERE slot = 'two_hours_before';
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TYPE reminder_slot RENAME TO reminder_slot_old;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TYPE reminder_slot AS ENUM ('night_before', 'morning_of');
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE reminders_sent
    ALTER COLUMN slot TYPE reminder_slot USING slot::text::reminder_slot;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TYPE reminder_slot_old;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE picks
    DROP COLUMN IF EXISTS start_time,
    DROP COLUMN IF EXISTS remind_two_hours_before;
-- +goose StatementEnd
