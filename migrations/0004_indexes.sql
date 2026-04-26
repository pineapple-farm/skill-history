-- Fix full table scans on MAX(captured_at) subqueries
-- Used by: homepage trending, sitemap, more-by-author, badge queries
CREATE INDEX idx_snapshots_captured_at ON snapshots(captured_at DESC);

-- Fix trending query sort performance
CREATE INDEX idx_snapshots_downloads ON snapshots(downloads DESC);
