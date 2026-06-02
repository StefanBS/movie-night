-- +goose Up
-- +goose StatementBegin
CREATE TABLE picks (
    id            uuid        PRIMARY KEY DEFAULT uuidv7(),
    group_id      uuid        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    picker_id     uuid            NULL REFERENCES users(id)  ON DELETE SET NULL,
    is_credited   boolean     NOT NULL DEFAULT true,
    scheduled_for date        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX ix_pick_group_date ON picks (group_id, scheduled_for);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX ix_pick_picker_credited ON picks (picker_id, is_credited);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS picks;
-- +goose StatementEnd
