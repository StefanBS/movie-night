-- +goose Up
-- +goose StatementBegin
-- Every Night has a picker (ADR-0008): unfinished plans live on the client, so
-- there is no longer an "open" (picker-less) night. Drop any left over.
DELETE FROM picks WHERE picker_id IS NULL;
-- +goose StatementEnd

-- +goose StatementBegin
DROP INDEX IF EXISTS uq_open_night_per_group;
-- +goose StatementEnd

-- +goose StatementBegin
-- People are deactivated, never deleted (ADR-0006), so a picker's row must
-- outlive their nights: RESTRICT replaces SET NULL, which would now violate
-- NOT NULL anyway.
ALTER TABLE picks
    ALTER COLUMN picker_id SET NOT NULL,
    DROP CONSTRAINT picks_picker_id_fkey,
    ADD CONSTRAINT picks_picker_id_fkey
        FOREIGN KEY (picker_id) REFERENCES users(id) ON DELETE RESTRICT;
-- +goose StatementEnd

-- +goose StatementBegin
-- At most one Night per group per date. Keep the newest of any same-date
-- duplicates so the unique index can build.
DELETE FROM picks p
USING picks q
WHERE p.group_id = q.group_id
  AND p.scheduled_for = q.scheduled_for
  AND (p.created_at, p.id) < (q.created_at, q.id);
-- +goose StatementEnd

-- +goose StatementBegin
-- The unique index also serves the (group_id, scheduled_for) lookups the plain
-- index did, so it replaces it.
DROP INDEX IF EXISTS ix_pick_group_date;
CREATE UNIQUE INDEX uq_night_per_group_date ON picks (group_id, scheduled_for);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS uq_night_per_group_date;
CREATE INDEX ix_pick_group_date ON picks (group_id, scheduled_for);
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE picks
    ALTER COLUMN picker_id DROP NOT NULL,
    DROP CONSTRAINT picks_picker_id_fkey,
    ADD CONSTRAINT picks_picker_id_fkey
        FOREIGN KEY (picker_id) REFERENCES users(id) ON DELETE SET NULL;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE UNIQUE INDEX uq_open_night_per_group ON picks (group_id) WHERE picker_id IS NULL;
-- +goose StatementEnd
