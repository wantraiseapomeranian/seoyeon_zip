-- One-time reconciliation of already-applied migrations; see docs/MIGRATIONS.md.
-- Run only after comparing the affected live schema and source rows with the
-- current migrations. This does not apply schema or seed SQL to a new database.
-- applied_at records reconciliation time, not the original application time.
WITH reconciled(name) AS (VALUES
 ('0012_instagram_feed.sql'),
 ('0013_management.sql'),
 ('0014_instagram_media.sql'),
 ('0015_instagram_sync.sql'),
 ('0016_wev86_source.sql'),
 ('0017_diverse_sources.sql')
)
INSERT INTO d1_migrations(name)
SELECT reconciled.name FROM reconciled
WHERE NOT EXISTS (SELECT 1 FROM d1_migrations recorded WHERE recorded.name=reconciled.name);
