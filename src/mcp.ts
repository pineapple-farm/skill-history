import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function createMcpHandler(db: D1Database) {
  const server = new McpServer({
    name: "skill-history",
    version: "1.0.0",
  });

  // Tool 1: get_skill_downloads
  server.registerTool(
    "get_skill_downloads",
    {
      title: "Get Skill Downloads",
      description:
        "Get download history snapshots for a ClawHub skill. Returns skill metadata and daily download counts over time.",
      inputSchema: {
        handle: z.string().describe("The skill author's handle (e.g. 'gavinlinasd')"),
        slug: z.string().describe("The skill slug (e.g. 'self-preserve')"),
      },
      outputSchema: {
        skill: z.object({
          id: z.number(),
          handle: z.string(),
          slug: z.string(),
          display_name: z.string().nullable(),
        }).describe("Skill metadata"),
        snapshots: z.array(z.object({
          captured_at: z.string().describe("Date in YYYY-MM-DD format"),
          downloads: z.number().describe("Cumulative download count"),
          installs_all_time: z.number().describe("Cumulative install count"),
        })).describe("Daily download snapshots ordered by date ascending"),
      },
      annotations: {
        title: "Get Skill Downloads",
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ handle, slug }: { handle: string; slug: string }) => {
      const skill = await db
        .prepare(
          "SELECT id, handle, slug, display_name FROM skills WHERE handle = ? AND slug = ?",
        )
        .bind(handle, slug)
        .first<{
          id: number;
          handle: string;
          slug: string;
          display_name: string | null;
        }>();

      if (!skill) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Skill not found",
                handle,
                slug,
              }),
            },
          ],
        };
      }

      const snapshots = await db
        .prepare(
          "SELECT captured_at, downloads, installs_all_time FROM snapshots WHERE skill_id = ? ORDER BY captured_at ASC",
        )
        .bind(skill.id)
        .all<{
          captured_at: string;
          downloads: number;
          installs_all_time: number;
        }>();

      return {
        structuredContent: {
          skill,
          snapshots: snapshots.results ?? [],
        },
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              skill,
              snapshots: snapshots.results ?? [],
            }),
          },
        ],
      };
    },
  );

  // Tool 2: search_skills
  server.registerTool(
    "search_skills",
    {
      title: "Search Skills",
      description:
        "Search for ClawHub skills by name, slug, or author handle. Returns matching skills with their latest download counts.",
      inputSchema: {
        query: z.string().describe("Search query to match against skill names, slugs, and author handles"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum results (default 10, max 50)"),
      },
      outputSchema: {
        query: z.string().describe("The search query that was used"),
        results: z.array(z.object({
          handle: z.string().describe("Skill author handle"),
          slug: z.string().describe("Skill slug"),
          display_name: z.string().nullable().describe("Human-readable skill name"),
          source: z.string().describe("Registry source (clawhub or skillssh)"),
          downloads: z.number().nullable().describe("Latest download count"),
        })).describe("Matching skills sorted by downloads descending"),
      },
      annotations: {
        title: "Search Skills",
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, limit }: { query: string; limit?: number }) => {
      const safeLimit = Math.min(limit ?? 10, 50);
      if (query.length < 2) {
        return {
          structuredContent: { query, results: [] },
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ query, results: [] }),
            },
          ],
        };
      }

      const pattern = `%${query}%`;
      const { results } = await db
        .prepare(
          `SELECT s.handle, s.slug, s.display_name, s.source,
                (SELECT sn.downloads FROM snapshots sn WHERE sn.skill_id = s.id ORDER BY sn.captured_at DESC LIMIT 1) as downloads
         FROM skills s
         WHERE s.handle LIKE ? OR s.slug LIKE ? OR s.display_name LIKE ?
         ORDER BY downloads DESC
         LIMIT ?`,
        )
        .bind(pattern, pattern, pattern, safeLimit)
        .all();

      return {
        structuredContent: { query, results: results ?? [] },
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ query, results: results ?? [] }),
          },
        ],
      };
    },
  );

  return server;
}
