-- +goose Up
-- +goose StatementBegin
-- An install's claimed identity (ADR-0009). Only a SHA-256 hash of the bearer
-- token is stored; the raw token lives on the device. Releasing an identity
-- deletes the row, which revokes the token.
CREATE TABLE devices (
    id           uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   bytea       NOT NULL UNIQUE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS devices;
-- +goose StatementEnd
