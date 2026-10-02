-- Display URLs can change rendition while the source URL retains dedup/review identity.
CREATE TABLE instagram_preview_urls (
 code TEXT NOT NULL REFERENCES instagram_review(code),
 source_url TEXT NOT NULL,
 preview_url TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(code,source_url)
);
