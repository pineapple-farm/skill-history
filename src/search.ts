// Skill search shared by GET /api/search and the MCP `search_skills` tool.
//
// `LIKE '%q%'` can't use an index, so every uncached search reads every row
// of the skills table (tens of thousands of rows). Results only change once
// a day after the sweep, so they're kept in the edge cache under a synthetic
// key that both callers share. The cache is per data centre; a given query
// still runs at most once per colo per hour.

export type SearchResult = {
  handle: string;
  slug: string;
  display_name: string | null;
  source: string;
  downloads: number | null;
};

export const SEARCH_CACHE_CONTROL = "public, max-age=300, s-maxage=3600";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function normaliseLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function cacheKey(query: string, limit: number): Request {
  const url = new URL("https://skill-history.com/__cache/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  return new Request(url.toString(), { method: "GET" });
}

export async function searchSkills(
  db: D1Database,
  rawQuery: string,
  rawLimit: number | undefined,
): Promise<SearchResult[]> {
  const query = rawQuery.trim();
  const limit = normaliseLimit(rawLimit);
  if (query.length < 2) return [];

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = cacheKey(query, limit);
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return (await hit.json()) as SearchResult[];
  }

  const pattern = `%${query}%`;
  const { results } = await db
    .prepare(
      `SELECT s.handle, s.slug, s.display_name, s.source,
              (SELECT sn.downloads FROM snapshots sn WHERE sn.skill_id = s.id ORDER BY sn.captured_at DESC LIMIT 1) AS downloads
       FROM skills s
       WHERE s.handle LIKE ? OR s.slug LIKE ? OR s.display_name LIKE ?
       ORDER BY downloads DESC
       LIMIT ?`,
    )
    .bind(pattern, pattern, pattern, limit)
    .all<SearchResult>();
  const rows = results ?? [];

  if (cache) {
    await cache.put(
      key,
      new Response(JSON.stringify(rows), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": SEARCH_CACHE_CONTROL,
        },
      }),
    );
  }
  return rows;
}
