-- +goose Up
-- +goose StatementBegin
CREATE TYPE reminder_slot AS ENUM ('night_before', 'morning_of');
-- +goose StatementEnd

-- +goose StatementBegin
-- Every reminder already sent (ADR-0010). A row is written before the send, so
-- a reminder goes out at most once per person, Night and slot, even if the
-- Night is edited afterwards.
CREATE TABLE reminders_sent (
    night_id uuid          NOT NULL REFERENCES picks(id) ON DELETE CASCADE,
    user_id  uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot     reminder_slot NOT NULL,
    sent_at  timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (night_id, user_id, slot)
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS reminders_sent;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TYPE IF EXISTS reminder_slot;
-- +goose StatementEnd
