-- Dev seed. NOT a migration. Idempotent via fixed UUIDs + ON CONFLICT DO NOTHING.
-- Group id 11111111-1111-1111-1111-111111111111 is shared by the integration
-- test and the mobile app.

INSERT INTO groups (id, name) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Friday Film Club')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, name) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Ada'),
    ('a0000000-0000-0000-0000-000000000002', 'Blake'),
    ('a0000000-0000-0000-0000-000000000003', 'Cleo'),
    ('a0000000-0000-0000-0000-000000000004', 'Dev'),
    ('a0000000-0000-0000-0000-000000000005', 'Esme'),
    ('a0000000-0000-0000-0000-000000000006', 'Frankie')
ON CONFLICT (id) DO NOTHING;

INSERT INTO memberships (group_id, user_id, role, status, baseline_picks, rotation_position) VALUES
    ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'core', 'active', 0, 1),
    ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', 'core', 'active', 0, 2),
    ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003', 'core', 'active', 0, 3),
    ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004', 'core', 'active', 0, 4),
    ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000005', 'core', 'active', 0, 5),
    ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000006', 'guest', 'active', 0, 6)
ON CONFLICT (group_id, user_id) DO NOTHING;

-- Films watched on the seeded nights, so Watched shows real titles and posters.
-- Real TMDB metadata (poster_path resolves against image.tmdb.org). Conflict on
-- tmdb_id (the natural key the app upserts by), not id, so a film a developer
-- already attached via the app isn't duplicated.
INSERT INTO movies (id, tmdb_id, title, release_year, poster_path) VALUES
    ('d0000000-0000-0000-0000-000000000001', 693134, 'Dune: Part Two', 2024, '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg'),
    ('d0000000-0000-0000-0000-000000000002', 872585, 'Oppenheimer',    2023, '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg'),
    ('d0000000-0000-0000-0000-000000000003', 666277, 'Past Lives',     2023, '/k3waqVXSnvCZWfJYNtdamTgTtTA.jpg'),
    ('d0000000-0000-0000-0000-000000000004', 933260, 'The Substance',  2024, '/lqoMzCcZYEFK729d6qzt349fB4o.jpg')
ON CONFLICT (tmdb_id) DO NOTHING;

-- Watched Nights for the turn ranking, each with its film. Ada is
-- intentionally absent (never picked → top of the ranking). Dev's pick is NOT
-- credited, so it must not count.
INSERT INTO nights (id, group_id, picker_id, is_credited, scheduled_for, movie_id, watched_at) VALUES
    ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', true,  '2026-05-01', (SELECT id FROM movies WHERE tmdb_id = 693134), '2026-05-01 23:00'),  -- Blake
    ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003', true,  '2026-04-10', (SELECT id FROM movies WHERE tmdb_id = 872585), '2026-04-10 23:00'),  -- Cleo (older)
    ('c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000005', true,  '2026-05-15', (SELECT id FROM movies WHERE tmdb_id = 666277), '2026-05-15 23:00'),  -- Esme
    ('c0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004', false, '2026-05-22', (SELECT id FROM movies WHERE tmdb_id = 933260), '2026-05-22 23:00')   -- Dev (NOT credited)
ON CONFLICT (id) DO NOTHING;

-- Attendees for the seeded nights. The picker must be an attendee so the Watched
-- list can resolve the picker's name (it looks the picker up among attendees);
-- a few others (incl. guest Frankie) make the rows realistic. Idempotent.
INSERT INTO attendances (night_id, user_id) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002'),  -- Blake (picker)
    ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),  -- Ada
    ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003'),  -- Cleo
    ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006'),  -- Frankie (guest)
    ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003'),  -- Cleo (picker)
    ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001'),  -- Ada
    ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002'),  -- Blake
    ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005'),  -- Esme (picker)
    ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001'),  -- Ada
    ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004'),  -- Dev
    ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004'),  -- Dev (picker)
    ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001'),  -- Ada
    ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005')   -- Esme
ON CONFLICT (night_id, user_id) DO NOTHING;
