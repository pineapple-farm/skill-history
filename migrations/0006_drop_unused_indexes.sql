-- Drop indexes nothing reads. Each one cost a write per row change and
-- storage, for no query benefit:
--
--   idx_snapshots_downloads   (downloads DESC) — no query filters or sorts on
--                             downloads without first pinning captured_at, so
--                             the planner never picks it (checked with EXPLAIN
--                             QUERY PLAN against production). Cost: one extra
--                             write for every snapshot row the sweep inserts.
--   idx_skills_source         superseded by idx_skills_source_first_seen,
--                             whose leading column is source.
--   idx_skills_source_id      only the removed skills.sh sweep used source_id.
--   idx_skills_github_repo    only the removed skills.sh sweep used github_repo.

DROP INDEX IF EXISTS idx_snapshots_downloads;
DROP INDEX IF EXISTS idx_skills_source;
DROP INDEX IF EXISTS idx_skills_source_id;
DROP INDEX IF EXISTS idx_skills_github_repo;
