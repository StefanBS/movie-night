-- +goose Up
-- +goose StatementBegin
-- Where a device's reminders go and whose clock they follow (ADR-0010). Both
-- stay NULL until the app registers for push; a device with no push token
-- gets no reminders.
ALTER TABLE devices
    ADD COLUMN push_token text,
    ADD COLUMN time_zone  text;
-- +goose StatementEnd

-- +goose StatementBegin
-- One switch per person that mutes every reminder and nudge to them.
ALTER TABLE users
    ADD COLUMN reminders_muted boolean NOT NULL DEFAULT false;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE users DROP COLUMN IF EXISTS reminders_muted;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE devices
    DROP COLUMN IF EXISTS push_token,
    DROP COLUMN IF EXISTS time_zone;
-- +goose StatementEnd
