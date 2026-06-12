-- +goose Up
-- +goose StatementBegin
CREATE TABLE movies (
    id           uuid        PRIMARY KEY DEFAULT uuidv7(),
    tmdb_id      integer     NOT NULL UNIQUE,
    title        varchar     NOT NULL,
    release_year integer         NULL,
    cached_at    timestamptz NOT NULL DEFAULT now()
);
-- +goose StatementEnd

-- +goose StatementBegin
-- Nullable on purpose: a night (picks row) is planned first and the movie is
-- attached later. RESTRICT keeps a movie any night references (history survives).
ALTER TABLE picks
    ADD COLUMN movie_id uuid NULL REFERENCES movies(id) ON DELETE RESTRICT;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE picks DROP COLUMN IF EXISTS movie_id;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS movies;
-- +goose StatementEnd
