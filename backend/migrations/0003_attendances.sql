-- +goose Up
-- +goose StatementBegin
CREATE TABLE attendances (
    id      uuid PRIMARY KEY DEFAULT uuidv7(),
    pick_id uuid NOT NULL REFERENCES picks(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE UNIQUE INDEX uq_attendance_pick_user ON attendances (pick_id, user_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS attendances;
-- +goose StatementEnd
