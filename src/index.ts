import { Hono } from "hono";
import { runSweep } from "./sweep";

type Env = {
  DB: D1Database;
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
  const result = await runSweep(c.env.DB);
  return c.json(result);
});

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const result = await runSweep(env.DB);
        console.log("sweep complete", result);
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
