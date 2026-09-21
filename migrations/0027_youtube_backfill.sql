-- Additive only; sources are activated after the compatible Worker is deployed.
ALTER TABLE youtube_sources ADD COLUMN backfill_handle TEXT;
ALTER TABLE youtube_sources ADD COLUMN backfill_channel_id TEXT;
ALTER TABLE youtube_sources ADD COLUMN backfill_until TEXT;
