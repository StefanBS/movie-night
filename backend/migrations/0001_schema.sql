-- +goose Up

-- People and groups (ADR-0004). Every human is one users row; a membership
-- links them to a group as a core member or a guest.
-- +goose StatementBegin
CREATE TYPE membership_role AS ENUM ('core', 'guest');
CREATE TYPE membership_status AS ENUM ('active', 'inactive');
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE users (
    id              uuid        PRIMARY KEY DEFAULT uuidv7(),
    name            varchar     NOT NULL,
    -- One switch per person that mutes every reminder and nudge to them
    -- (ADR-0010).
    reminders_muted boolean     NOT NULL DEFAULT false,
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
-- People are deactivated, never deleted (ADR-0006). baseline_picks seeds a
-- member entering the rotation to the active-core average; rotation_position
-- is the turn ranking's last tiebreak.
CREATE TABLE memberships (
    id                uuid              PRIMARY KEY DEFAULT uuidv7(),
    group_id          uuid              NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id           uuid              NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    role              membership_role   NOT NULL,
    status            membership_status NOT NULL DEFAULT 'active',
    baseline_picks    integer           NOT NULL DEFAULT 0,
    rotation_position integer           NOT NULL,
    joined_at         timestamptz       NOT NULL DEFAULT now(),
    left_at           timestamptz
);
CREATE UNIQUE INDEX uq_membership_group_user ON memberships (group_id, user_id);
CREATE INDEX ix_membership_active_core ON memberships (group_id, status, role);
-- +goose StatementEnd

-- +goose StatementBegin
-- A film as TMDB described it when it was last attached (ADR-0007). poster_path
-- is TMDB's raw path; the image URL is built when the response is rendered.
-- genres are TMDB's genre names in TMDB order.
CREATE TABLE movies (
    id              uuid    PRIMARY KEY DEFAULT uuidv7(),
    tmdb_id         integer NOT NULL UNIQUE,
    title           varchar NOT NULL,
    release_year    integer,
    poster_path     varchar,
    genres          text[]  NOT NULL DEFAULT '{}',
    runtime_minutes integer
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TYPE reminder_audience AS ENUM ('everyone', 'picker');
CREATE TYPE repeat_freq AS ENUM ('weekly', 'monthly');
-- +goose StatementEnd

-- +goose StatementBegin
-- One dated movie night of a group. Every Night has a picker (ADR-0008), and a
-- group has at most one Night per date. is_credited is false for a guest's
-- pick, so it never moves the rotation (ADR-0006).
--
-- start_time is a zone-less wall-clock time read on each device (ADR-0011);
-- the two-hours-before reminder only fires on a Night that has one. The
-- reminder settings are shared by the group (ADR-0010). watched_at is NULL
-- until the group records the Night as watched (ADR-0012).
--
-- A repeating Night carries its rule (ADR-0014): weekly every 1 or 2 weeks on
-- the Night's weekday, or monthly on the Nth (1–4) or last (-1) of that
-- weekday. All three NULL is a Night that doesn't repeat.
CREATE TABLE nights (
    id                      uuid              PRIMARY KEY DEFAULT uuidv7(),
    group_id                uuid              NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    scheduled_for           date              NOT NULL,
    start_time              time,
    -- RESTRICT: a picker's row must outlive their Nights.
    picker_id               uuid              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_credited             boolean           NOT NULL DEFAULT true,
    -- RESTRICT keeps a film any Night references.
    movie_id                uuid              REFERENCES movies(id) ON DELETE RESTRICT,
    remind_night_before     boolean           NOT NULL DEFAULT true,
    remind_morning_of       boolean           NOT NULL DEFAULT true,
    remind_two_hours_before boolean           NOT NULL DEFAULT true,
    remind_audience         reminder_audience NOT NULL DEFAULT 'everyone',
    watched_at              timestamptz,
    repeat_freq             repeat_freq,
    repeat_interval_weeks   smallint,
    repeat_week_of_month    smallint,
    created_at              timestamptz       NOT NULL DEFAULT now(),
    CONSTRAINT ck_night_repeat CHECK (
        (repeat_freq IS NULL AND repeat_interval_weeks IS NULL AND repeat_week_of_month IS NULL)
        OR (repeat_freq = 'weekly' AND repeat_interval_weeks IN (1, 2) AND repeat_week_of_month IS NULL)
        OR (repeat_freq = 'monthly' AND repeat_interval_weeks IS NULL AND repeat_week_of_month IN (1, 2, 3, 4, -1))
    ),
    -- A Watched Night has a film and doesn't repeat (ADR-0012, ADR-0014).
    CONSTRAINT ck_night_watched_has_film CHECK (watched_at IS NULL OR movie_id IS NOT NULL),
    CONSTRAINT ck_night_watched_no_repeat CHECK (watched_at IS NULL OR repeat_freq IS NULL)
);
CREATE UNIQUE INDEX uq_night_per_group_date ON nights (group_id, scheduled_for);
CREATE INDEX ix_night_picker_credited ON nights (picker_id, is_credited);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE attendances (
    id       uuid PRIMARY KEY DEFAULT uuidv7(),
    night_id uuid NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
    user_id  uuid NOT NULL REFERENCES users(id)  ON DELETE CASCADE
);
CREATE UNIQUE INDEX uq_attendance_night_user ON attendances (night_id, user_id);
-- +goose StatementEnd

-- +goose StatementBegin
-- A full Night: the nights row plus its film's columns. Every Night read
-- selects from here, so a new Night column is added to this view too. Writes
-- go to nights; a join view is read-only.
CREATE VIEW full_nights AS
SELECT
  n.id, n.group_id, n.scheduled_for, n.start_time, n.picker_id, n.is_credited,
  n.remind_night_before, n.remind_morning_of, n.remind_two_hours_before, n.remind_audience,
  n.watched_at,
  n.repeat_freq, n.repeat_interval_weeks, n.repeat_week_of_month,
  n.created_at,
  m.tmdb_id         AS movie_tmdb_id,
  m.title           AS movie_title,
  m.release_year    AS movie_release_year,
  m.poster_path     AS movie_poster_path,
  m.genres          AS movie_genres,
  m.runtime_minutes AS movie_runtime_minutes
FROM nights n
LEFT JOIN movies m ON m.id = n.movie_id;
-- +goose StatementEnd

-- +goose StatementBegin
-- An install's claimed identity (ADR-0009). Only a SHA-256 hash of the bearer
-- token is stored; the raw token lives on the device. Releasing an identity
-- deletes the row, which revokes the token. push_token and time_zone stay NULL
-- until the app registers for push; a device without them gets no reminders
-- (ADR-0010).
CREATE TABLE devices (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash bytea       NOT NULL UNIQUE,
    push_token text,
    time_zone  text,
    created_at timestamptz NOT NULL DEFAULT now()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TYPE reminder_slot AS ENUM ('night_before', 'morning_of', 'two_hours_before');
-- +goose StatementEnd

-- +goose StatementBegin
-- Every reminder already sent (ADR-0010). A row is written before the send, so
-- a reminder goes out at most once per person, Night and slot, even if the
-- Night is edited afterwards.
CREATE TABLE reminders_sent (
    night_id uuid          NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
    user_id  uuid          NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    slot     reminder_slot NOT NULL,
    sent_at  timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (night_id, user_id, slot)
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS reminders_sent, devices, attendances;
DROP VIEW IF EXISTS full_nights;
DROP TABLE IF EXISTS nights, movies, memberships, groups, users;
DROP TYPE IF EXISTS reminder_slot, repeat_freq, reminder_audience, membership_status, membership_role;
-- +goose StatementEnd
