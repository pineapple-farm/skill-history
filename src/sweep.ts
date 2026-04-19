const CONVEX_URL = "https://wry-manatee-359.convex.cloud";
const CONVEX_CLIENT = "npm-1.20.0";
const PAGE_SIZE = 200;
const USER_AGENT =
  "skill-history.com crawler (+https://skill-history.com; contact: gavin.lin.asd@gmail.com)";

// Cloudflare free-plan caps subrequests (fetch calls) at 50 per invocation.
// D1 batch calls are internal bindings, not subrequests, so only Convex
// fetches count. 48 pages = 48 fetches, safely under 50.
// With 0 */2 cron (12 fires/day): 12 × 48 = 576 > 280 pages = full sweep.
const MAX_PAGES_PER_RUN = 48;

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

type SweepResult = {
  started_at_utc: string;
  captured_at: string;
  resumed_from_cursor: boolean;
  pages_this_run: number;
  skills_this_run: number;
  pages_done_today: number;
  complete_for_today: boolean;
  duration_ms: number;
};

async function fetchPage(cursor: string | null): Promise<PageResponse> {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Convex-Client": CONVEX_CLIENT,
      "User-Agent": USER_AGENT,
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

type SweepState = {
  cursor: string | null;
  captured_at: string | null;
  pages_done: number;
};

async function loadState(db: D1Database): Promise<SweepState> {
  const row = await db
    .prepare(
      "SELECT cursor, captured_at, pages_done FROM sweep_state WHERE id = 1",
    )
    .first<SweepState>();
  return row ?? { cursor: null, captured_at: null, pages_done: 0 };
}

async function saveState(
  db: D1Database,
  cursor: string | null,
  capturedAt: string,
  pagesDone: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE sweep_state
       SET cursor = ?, captured_at = ?, pages_done = ?, updated_at = ?
       WHERE id = 1`,
    )
    .bind(cursor, capturedAt, pagesDone, Date.now())
    .run();
}

export async function runSweep(db: D1Database): Promise<SweepResult> {
  const started = Date.now();
  const startedAtUtc = new Date(started).toISOString();
  const today = startedAtUtc.slice(0, 10);

  const state = await loadState(db);
  const sameDay = state.captured_at === today;
  const cursorIn = sameDay ? state.cursor : null;
  const resumedFromCursor = sameDay && !!state.cursor;
  const pagesDoneAtStart = sameDay ? state.pages_done : 0;

  if (!sameDay && state.cursor) {
    console.log(
      `[sweep] WARNING: prior day ${state.captured_at} incomplete (pages_done=${state.pages_done}) — starting fresh for ${today}`,
    );
  }

  console.log(
    `[sweep] start captured_at=${today} resuming=${resumedFromCursor} pages_done_today=${pagesDoneAtStart} same_day=${sameDay}`,
  );

  if (sameDay && !state.cursor && state.pages_done > 0) {
    console.log(`[sweep] already complete for ${today} — no-op`);
    return {
      started_at_utc: startedAtUtc,
      captured_at: today,
      resumed_from_cursor: false,
      pages_this_run: 0,
      skills_this_run: 0,
      pages_done_today: pagesDoneAtStart,
      complete_for_today: true,
      duration_ms: 0,
    };
  }

  let cursor = cursorIn;
  let pagesThisRun = 0;
  let skillsThisRun = 0;
  let sawEnd = false;

  try {
    while (pagesThisRun < MAX_PAGES_PER_RUN) {
      const { page, hasMore, nextCursor } = await fetchPage(cursor);
      pagesThisRun++;

      const stmts: D1PreparedStatement[] = [];
      for (const row of page) {
        stmts.push(
          db
            .prepare(
              `INSERT INTO skills (handle, slug, display_name)
               VALUES (?, ?, ?)
               ON CONFLICT(handle, slug) DO UPDATE SET display_name = excluded.display_name`,
            )
            .bind(row.ownerHandle, row.skill.slug, row.skill.displayName),
        );
        stmts.push(
          db
            .prepare(
              `INSERT INTO snapshots (skill_id, captured_at, downloads, installs_all_time)
               VALUES ((SELECT id FROM skills WHERE handle = ? AND slug = ?), ?, ?, ?)
               ON CONFLICT(skill_id, captured_at) DO UPDATE SET
                 downloads = excluded.downloads,
                 installs_all_time = excluded.installs_all_time`,
            )
            .bind(
              row.ownerHandle,
              row.skill.slug,
              today,
              row.skill.stats.downloads,
              row.skill.stats.installsAllTime,
            ),
        );
        skillsThisRun++;
      }

      if (stmts.length > 0) {
        await db.batch(stmts);
      }

      if (!hasMore) {
        sawEnd = true;
        cursor = null;
        break;
      }
      cursor = nextCursor;
    }
  } catch (err) {
    console.error(
      `[sweep] error after pages_this_run=${pagesThisRun} — persisting cursor and rethrowing`,
      err,
    );
    await saveState(db, cursor, today, pagesDoneAtStart + pagesThisRun);
    throw err;
  }

  const pagesDoneTotal = pagesDoneAtStart + pagesThisRun;
  await saveState(db, sawEnd ? null : cursor, today, pagesDoneTotal);

  const result: SweepResult = {
    started_at_utc: startedAtUtc,
    captured_at: today,
    resumed_from_cursor: resumedFromCursor,
    pages_this_run: pagesThisRun,
    skills_this_run: skillsThisRun,
    pages_done_today: pagesDoneTotal,
    complete_for_today: sawEnd,
    duration_ms: Date.now() - started,
  };

  console.log(
    `[sweep] done pages_this_run=${pagesThisRun} skills_this_run=${skillsThisRun} pages_done_today=${pagesDoneTotal} complete=${sawEnd} duration_ms=${result.duration_ms}`,
  );

  return result;
}
