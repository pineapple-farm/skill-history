import { Hono } from "hono";
import { runSweep } from "./sweep";
import {
  MIN_SNAPSHOTS_FOR_CHART,
  renderChartPageHtml,
  renderChartSvg,
  renderGateSvg,
  renderNotFoundSvg,
  type Snapshot,
  type SkillMeta,
} from "./chart";

type Env = {
  DB: D1Database;
  ADMIN_SECRET?: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("skill-history.com — Pineapple AI"));

app.get("/healthz", async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const [counts, state] = await Promise.all([
    c.env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM skills) AS skills,
         (SELECT COUNT(*) FROM snapshots) AS snapshots,
         (SELECT COUNT(*) FROM snapshots WHERE captured_at = ?) AS snapshots_today`,
    )
      .bind(today)
      .first<{ skills: number; snapshots: number; snapshots_today: number }>(),
    c.env.DB.prepare(
      "SELECT cursor, captured_at, pages_done, updated_at FROM sweep_state WHERE id = 1",
    ).first<{
      cursor: string | null;
      captured_at: string | null;
      pages_done: number;
      updated_at: number;
    }>(),
  ]);
  const sweep =
    state && state.captured_at === today
      ? {
          captured_at: state.captured_at,
          pages_done_today: state.pages_done,
          complete_for_today: state.cursor === null && state.pages_done > 0,
          cursor_in_progress: !!state.cursor,
          updated_at_utc: state.updated_at
            ? new Date(state.updated_at).toISOString()
            : null,
        }
      : { captured_at: today, pages_done_today: 0, complete_for_today: false };
  return c.json({ status: "ok", today, ...counts, sweep });
});

async function loadSkillAndSnapshots(
  db: D1Database,
  handle: string,
  slug: string,
): Promise<{ skill: SkillMeta & { id: number }; snapshots: Snapshot[] } | null> {
  const skill = await db
    .prepare(
      "SELECT id, handle, slug, display_name FROM skills WHERE handle = ? AND slug = ?",
    )
    .bind(handle, slug)
    .first<{ id: number; handle: string; slug: string; display_name: string | null }>();
  if (!skill) return null;
  const snapshots = await db
    .prepare(
      "SELECT captured_at, downloads, installs_all_time FROM snapshots WHERE skill_id = ? ORDER BY captured_at ASC",
    )
    .bind(skill.id)
    .all<Snapshot>();
  return { skill, snapshots: snapshots.results ?? [] };
}

const SVG_HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
  "Access-Control-Allow-Origin": "*",
};

app.get("/chart/:handle/:slugSvg", async (c) => {
  const handle = c.req.param("handle");
  const slugSvg = c.req.param("slugSvg");
  if (!slugSvg.endsWith(".svg")) {
    return c.notFound();
  }
  const slug = slugSvg.slice(0, -4);
  const data = await loadSkillAndSnapshots(c.env.DB, handle, slug);
  if (!data) {
    return new Response(renderNotFoundSvg(handle, slug), {
      status: 404,
      headers: SVG_HEADERS,
    });
  }
  const { skill, snapshots } = data;
  const body =
    snapshots.length < MIN_SNAPSHOTS_FOR_CHART
      ? renderGateSvg(skill, snapshots.length)
      : renderChartSvg(skill, snapshots);
  return new Response(body, { status: 200, headers: SVG_HEADERS });
});

app.get("/:handle/:slug", async (c) => {
  const { handle, slug } = c.req.param();
  const data = await loadSkillAndSnapshots(c.env.DB, handle, slug);
  const wantsJson =
    c.req.header("accept")?.includes("application/json") ?? false;
  if (!data) {
    if (wantsJson) {
      return c.json({ error: "skill not tracked", handle, slug }, 404);
    }
    return c.html(
      `<!DOCTYPE html><meta charset="utf-8"><title>Not found — skill-history.com</title><body style="font-family:system-ui;max-width:640px;margin:40px auto;padding:0 16px"><h1>Skill not tracked</h1><p><code>${handle}/${slug}</code> isn't in our index. If this skill exists on ClawHub, it should appear within 6 hours.</p></body>`,
      404,
    );
  }
  if (wantsJson) {
    return c.json({ skill: data.skill, snapshots: data.snapshots });
  }
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;
  return c.html(renderChartPageHtml(data.skill, data.snapshots, origin));
});

app.post("/admin/sweep", async (c) => {
  const secret = c.env.ADMIN_SECRET;
  if (!secret || c.req.header("x-admin-secret") !== secret) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const result = await runSweep(c.env.DB);
  return c.json(result);
});

export default {
  fetch: app.fetch,

  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const result = await runSweep(env.DB);
    console.log("sweep complete", result);
  },
} satisfies ExportedHandler<Env>;
