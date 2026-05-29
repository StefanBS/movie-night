-- +goose Up
-- +goose StatementBegin
CREATE TYPE membership_role AS ENUM ('core', 'guest');
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TYPE membership_status AS ENUM ('active', 'inactive');
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE users (
    id              uuid        PRIMARY KEY DEFAULT uuidv7(),
    name            varchar     NOT NULL,
    letterboxd_user varchar,
    created_at      timestamptz NOT NULL DEFAULT now()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE groups (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    name       varchar     NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE memberships (
    id                uuid              PRIMARY KEY DEFAULT uuidv7(),
    group_id          uuid              NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id           uuid              NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    role              membership_role   NOT NULL DEFAULT 'core',
    status            membership_status NOT NULL DEFAULT 'active',
    baseline_picks    integer           NOT NULL DEFAULT 0,
    rotation_position integer           NOT NULL,
    joined_at         timestamptz       NOT NULL DEFAULT now(),
    left_at           timestamptz
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE UNIQUE INDEX uq_membership_group_user ON memberships (group_id, user_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX ix_membership_active_core ON memberships (group_id, status, role);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS memberships;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS groups;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS users;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TYPE IF EXISTS membership_status;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TYPE IF EXISTS membership_role;
-- +goose StatementEnd
