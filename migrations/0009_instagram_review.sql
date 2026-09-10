CREATE TABLE instagram_review (
  code TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','kept','excluded','held')),
  revision INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX instagram_review_status ON instagram_review(status, imported_at DESC, code);
