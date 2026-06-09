-- +goose Up
-- +goose StatementBegin
-- A "night" is a picks row with picker_id NULL. A group may have at most one
-- open night at a time; this partial unique index enforces that invariant at the
-- DB. Recorded picks (picker_id set) are unconstrained — a group has many of
-- those over time.
CREATE UNIQUE INDEX uq_open_night_per_group ON picks (group_id) WHERE picker_id IS NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS uq_open_night_per_group;
-- +goose StatementEnd
