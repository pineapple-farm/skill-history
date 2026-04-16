const CONVEX_URL = "https://wry-manatee-359.convex.cloud";
const CONVEX_CLIENT = "npm-1.20.0";
const PAGE_SIZE = 200;

type SkillRow = {
  ownerHandle: string;
  skill: {
    slug: string;
    displayName: string;
    stats: {
      downloads: number;
      installsAllTime: number;
    };
  };
};

type PageResponse = {
  page: SkillRow[];
  hasMore: boolean;
  nextCursor: string | null;
};

async function fetchPage(cursor: string | null): Promise<PageResponse> {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Convex-Client": CONVEX_CLIENT,
    },
    body: JSON.stringify({
      path: "skills:listPublicPageV4",
      format: "convex_encoded_json",
      args: [
        {
          numItems: PAGE_SIZE,
          sort: "downloads",
          ...(cursor ? { cursor } : {}),
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Convex HTTP ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    status: string;
    value?: PageResponse;
    errorMessage?: string;
  };
  if (body.status !== "success" || !body.value) {
    throw new Error(`Convex error: ${body.errorMessage ?? "unknown"}`);
  }
  return body.value;
}

export async function runSweep(db: D1Database): Promise<{
  pages: number;
  skills: number;
  durationMs: number;
}> {
  const started = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  const existing = await db
    .prepare("SELECT id, handle, slug FROM skills")
    .all<{ id: number; handle: string; slug: string }>();
  const idMap = new Map<string, number>();
  for (const r of existing.results ?? []) {
    idMap.set(`${r.handle}\u0001${r.slug}`, r.id);
  }

  let cursor: string | null = null;
  let pages = 0;
  let totalSkills = 0;

  while (true) {
    const { page, hasMore, nextCursor } = await fetchPage(cursor);
    pages++;

    const snapshotStmts: D1PreparedStatement[] = [];

    for (const row of page) {
      const key = `${row.ownerHandle}\u0001${row.skill.slug}`;
      let skillId = idMap.get(key);

      if (skillId === undefined) {
        const inserted = await db
          .prepare(
            `INSERT INTO skills (handle, slug, display_name)
             VALUES (?, ?, ?)
             ON CONFLICT(handle, slug) DO UPDATE SET display_name = excluded.display_name
             RETURNING id`,
          )
          .bind(row.ownerHandle, row.skill.slug, row.skill.displayName)
          .first<{ id: number }>();
        if (!inserted) continue;
        skillId = inserted.id;
        idMap.set(key, skillId);
      }

      snapshotStmts.push(
        db
          .prepare(
            `INSERT INTO snapshots (skill_id, captured_at, downloads, installs_all_time)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(skill_id, captured_at) DO UPDATE SET
               downloads = excluded.downloads,
               installs_all_time = excluded.installs_all_time`,
          )
          .bind(
            skillId,
            today,
            row.skill.stats.downloads,
            row.skill.stats.installsAllTime,
          ),
      );
      totalSkills++;
    }

    if (snapshotStmts.length > 0) {
      await db.batch(snapshotStmts);
    }

    if (!hasMore) break;
    cursor = nextCursor;
  }

  return { pages, skills: totalSkills, durationMs: Date.now() - started };
}
