import { Hono } from "hono";
import { runSweep } from "./sweep";

type Env = {
  DB: D1Database;
  ADMIN_SECRET?: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("skill-history.com — Pineapple AI"));

app.get("/healthz", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT COUNT(*) AS skills, (SELECT COUNT(*) FROM snapshots) AS snapshots FROM skills",
  ).first<{ skills: number; snapshots: number }>();
  return c.json({ status: "ok", ...row });
});

app.post("/admin/sweep", async (c) => {
  const secret = c.env.ADMIN_SECRET;
  if (!secret || c.req.header("x-admin-secret") !== secret) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const result = await runSweep(c.env.DB);
        console.log("admin sweep complete", result);
      } catch (err) {
        console.error("admin sweep failed", err);
      }
    })(),
  );
  return c.json({ status: "started" }, 202);
});

export default {
  fetch: app.fetch,

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const result = await runSweep(env.DB);
        console.log("sweep complete", result);
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
