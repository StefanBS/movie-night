-- Fixture: tonight's Night as the e2e flow plan-night leaves it, for the flows
-- that need a planned Night without planning one through the UI
-- (mobile/.maestro). Ada and Blake are coming (not Cleo), Ada picks, and her
-- pick is Dune (2021), as TMDB describes it when the app attaches it. No start
-- time, the default reminders, no repeat. Keep it in step with plan-night,
-- which ends by asserting these facts.
--
-- Applied on top of seed.sql (POST /dev/reseed?fixture=… or just reseed …).
-- "Tonight" is fixture.today, the date of the machine running the flows,
-- passed in: not CURRENT_DATE, which is the database's (UTC) date.
BEGIN;

INSERT INTO movies (id, tmdb_id, title, release_year, poster_path, genres, runtime_minutes) VALUES
    ('d0000000-0000-0000-0000-000000000005', 438631, 'Dune', 2021, '/v1tRXZ4JtD2Iv6fjkPvT4GiwslV.jpg',
     '{Science Fiction,Adventure}', 155);

INSERT INTO nights (id, group_id, picker_id, is_credited, scheduled_for, movie_id) VALUES
    ('c0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
     'a0000000-0000-0000-0000-000000000001', true, current_setting('fixture.today')::date,
     'd0000000-0000-0000-0000-000000000005');  -- Ada

INSERT INTO attendances (night_id, group_id, user_id) VALUES
    ('c0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001'),  -- Ada (picker)
    ('c0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002');  -- Blake

COMMIT;
