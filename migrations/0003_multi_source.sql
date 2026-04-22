-- Add source tracking to skills table
ALTER TABLE skills ADD COLUMN source TEXT NOT NULL DEFAULT 'clawhub';
ALTER TABLE skills ADD COLUMN source_id TEXT;
ALTER TABLE skills ADD COLUMN github_repo TEXT;

-- Separate snapshot table for skills.sh (keeps existing snapshots untouched)
CREATE TABLE snapshots_sh (
  skill_id INTEGER NOT NULL REFERENCES skills(id),
  captured_at TEXT NOT NULL,
  installs INTEGER NOT NULL,
  PRIMARY KEY (skill_id, captured_at)
);

-- Per-source sweep state (replaces singleton sweep_state for new sources)
CREATE TABLE sweep_state_v2 (
  source TEXT PRIMARY KEY,
  cursor TEXT,
  captured_at TEXT,
  pages_done INTEGER NOT NULL DEFAULT 0,
  extra_state TEXT,
  updated_at INTEGER NOT NULL
);

-- Seed skills.sh sweep state
INSERT INTO sweep_state_v2 (source, cursor, captured_at, pages_done, extra_state, updated_at)
  VALUES ('skillssh', NULL, NULL, 0, NULL, 0);

-- Index for source lookups
CREATE INDEX idx_skills_source ON skills(source);
CREATE INDEX idx_skills_source_id ON skills(source, source_id);
CREATE INDEX idx_skills_github_repo ON skills(github_repo);
