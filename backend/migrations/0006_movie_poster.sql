-- +goose Up
-- +goose StatementBegin
-- Raw TMDB poster_path (e.g. "/abc.jpg"); nullable because TMDB often has none.
-- The full image URL is built at DTO-render time, so size is not stored here.
ALTER TABLE movies ADD COLUMN poster_path varchar NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE movies DROP COLUMN IF EXISTS poster_path;
-- +goose StatementEnd
