-- Cut D1 rows_read on the blog. Its weekly stats used to GROUP BY the entire
-- snapshots table (one row per skill per day, millions of rows) on every
-- render. Two changes:
--
-- 1. skills.first_seen: the date of a skill's first snapshot. The sweep sets
--    it on insert; this migration backfills existing rows. "New this week"
--    and catalog-size queries now range-scan a small index instead of
--    grouping all snapshots.
-- 2. weekly_post_cache: materialised blog post data per week, so a week's
--    leaderboards are computed once (once a day while in progress) rather
--    than once per request per data centre.

ALTER TABLE skills ADD COLUMN first_seen TEXT;

-- Correlated MIN over the (skill_id, captured_at) primary key is a single
-- seek per skill. Restricted to clawhub rows: skills.sh rows have no rows in
-- snapshots and would only cost a write each.
UPDATE skills
SET first_seen = (
  SELECT MIN(captured_at) FROM snapshots WHERE snapshots.skill_id = skills.id
)
WHERE source = 'clawhub';

CREATE INDEX idx_skills_source_first_seen ON skills(source, first_seen);

CREATE TABLE weekly_post_cache (
  week_start TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  final INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL
);
