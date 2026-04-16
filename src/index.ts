import { Hono } from "hono";
import { runSweep } from "./sweep";

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

app.get("/:handle/:slug", async (c) => {
  const { handle, slug } = c.req.param();
  const skill = await c.env.DB.prepare(
    "SELECT id, handle, slug, display_name FROM skills WHERE handle = ? AND slug = ?",
  )
    .bind(handle, slug)
    .first<{ id: number; handle: string; slug: string; display_name: string }>();
  if (!skill) {
    return c.json({ error: "skill not tracked", handle, slug }, 404);
  }
  const snapshots = await c.env.DB.prepare(
    "SELECT captured_at, downloads, installs_all_time FROM snapshots WHERE skill_id = ? ORDER BY captured_at ASC",
  )
    .bind(skill.id)
    .all<{
      captured_at: string;
      downloads: number;
      installs_all_time: number;
    }>();
  return c.json({ skill, snapshots: snapshots.results ?? [] });
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
