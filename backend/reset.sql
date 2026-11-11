-- Empties every table except goose's version table, leaving the schema. Shared
-- by `just reseed`, the dev-only POST /dev/reseed (devreset.go) and the
-- integration tests' freshDB, so all three reset the same way. It lists the
-- tables at run time, so a new table is emptied without editing this file.
DO $$
BEGIN
    EXECUTE (
        SELECT 'TRUNCATE ' || string_agg(format('%I', tablename), ', ') || ' CASCADE'
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> 'goose_db_version'
    );
END
$$;
