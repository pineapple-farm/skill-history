CREATE TABLE sweep_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor TEXT,
  captured_at TEXT,
  pages_done INTEGER NOT NULL DEFAULT 0,
  total_pages_last_run INTEGER,
  updated_at INTEGER NOT NULL
);

INSERT INTO sweep_state (id, cursor, captured_at, pages_done, updated_at)
VALUES (1, NULL, NULL, 0, 0);
