-- +goose Up
-- +goose StatementBegin
-- Who a Night's reminders go to (ADR-0010): every attendee, or only the
-- picker. The picker's nudge goes out whatever the audience.
CREATE TYPE reminder_audience AS ENUM ('everyone', 'picker');
-- +goose StatementEnd

-- +goose StatementBegin
-- A Night's reminder settings are shared by the group. Existing and new Nights
-- default to the night-before and morning-of reminders, to everyone coming.
ALTER TABLE picks
    ADD COLUMN remind_night_before boolean           NOT NULL DEFAULT true,
    ADD COLUMN remind_morning_of   boolean           NOT NULL DEFAULT true,
    ADD COLUMN remind_audience     reminder_audience NOT NULL DEFAULT 'everyone';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE picks
    DROP COLUMN IF EXISTS remind_night_before,
    DROP COLUMN IF EXISTS remind_morning_of,
    DROP COLUMN IF EXISTS remind_audience;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TYPE IF EXISTS reminder_audience;
-- +goose StatementEnd
