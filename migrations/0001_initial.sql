CREATE TABLE skills (
  id INTEGER PRIMARY KEY,
  handle TEXT NOT NULL,
  slug TEXT NOT NULL,
  display_name TEXT,
  UNIQUE(handle, slug)
);

CREATE TABLE snapshots (
  skill_id INTEGER NOT NULL REFERENCES skills(id),
  captured_at TEXT NOT NULL,
  downloads INTEGER NOT NULL,
  installs_all_time INTEGER,
  PRIMARY KEY (skill_id, captured_at)
);
