-- Previous snapshots did not measure YouTube: NULL is unknown, not zero.
ALTER TABLE operations_history ADD COLUMN youtube_total INTEGER CHECK(youtube_total IS NULL OR youtube_total>=0);
