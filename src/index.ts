import { Hono } from "hono";
import { runSweep } from "./sweep";
import {
  renderChartPageHtml,
  renderChartSvg,
  renderEmptySvg,
  renderNotFoundSvg,
  type Snapshot,
  type SkillMeta,
} from "./chart";

type Env = {
  DB: D1Database;
  ADMIN_SECRET?: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => {
  const examples = [
    { handle: "pskoett", slug: "self-improving-agent" },
    { handle: "spclaudehome", slug: "skill-vetter" },
    { handle: "oswalpalash", slug: "ontology" },
  ];

  const exampleCards = examples
    .map(
      (e) => `
      <div class="chart">
        <a href="/${e.handle}/${e.slug}">
          <img src="/chart/${e.handle}/${e.slug}.svg" alt="Download history for ${e.handle}/${e.slug}" loading="lazy">
        </a>
      </div>`,
    )
    .join("");

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>skill-history.com — Track ClawHub skill download history</title>
<meta name="description" content="Track and visualize ClawHub skill download history. Star-history, for agent skills.">
<link rel="canonical" href="https://skill-history.com/">
<meta property="og:type" content="website">
<meta property="og:title" content="skill-history.com">
<meta property="og:description" content="Track and visualize ClawHub skill download history. Star-history, for agent skills.">
<meta property="og:url" content="https://skill-history.com/">
<meta name="twitter:card" content="summary">
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #111827; line-height: 1.5; }
  h1 { margin: 0 0 4px; font-size: 28px; }
  .tagline { color: #6b7280; font-size: 16px; margin: 0 0 32px; }
  h2 { font-size: 18px; margin: 36px 0 12px; }
  h3 { font-size: 15px; margin: 24px 0 8px; }
  p, li { font-size: 15px; }
  code { background: #f3f4f6; padding: 2px 5px; border-radius: 4px; font-size: 13px; }
  pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; white-space: pre-wrap; word-break: break-all; }
  .chart { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: white; margin: 16px 0; }
  .chart img { display: block; width: 100%; height: auto; }
  .chart a { display: block; }
  .input-section { margin: 32px 0; }
  .input-row { display: flex; gap: 8px; }
  .input-row input { flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: inherit; background: white; color: #111827; }
  .input-row button { padding: 8px 16px; border: none; border-radius: 6px; background: #f97316; color: white; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
  .input-row button:hover { background: #ea580c; }
  #link-output { margin-top: 16px; display: none; }
  #link-output .result-block { margin: 8px 0; }
  #link-output label { font-size: 13px; font-weight: 600; color: #6b7280; display: block; margin-bottom: 4px; }
  #link-output pre { margin: 0; }
  #link-output a { color: #f97316; text-decoration: none; }
  #link-output a:hover { text-decoration: underline; }
  #link-error { color: #ef4444; font-size: 14px; margin-top: 8px; display: none; }
  .mapping { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
  .mapping p { margin: 6px 0; font-size: 14px; }
  .arrow { color: #9ca3af; margin: 0 4px; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 13px; }
  footer a { color: #6b7280; }
  @media (prefers-color-scheme: dark) {
    body { color: #e5e7eb; background: #0f172a; }
    .tagline, footer, footer a { color: #9ca3af; }
    code { background: #1e293b; }
    pre { background: #1e293b; }
    .chart { border-color: #334155; background: white; }
    .mapping { background: #1e293b; border-color: #334155; }
    .input-row input { background: #1e293b; border-color: #334155; color: #e5e7eb; }
    #link-output label { color: #9ca3af; }
    #link-error { color: #f87171; }
  }
</style>
</head>
<body>
<header>
  <h1>skill-history.com</h1>
  <p class="tagline">Track and visualize ClawHub skill download history. Star-history, for agent skills.</p>
</header>

<section>
  <h2>How it works</h2>
  <div class="mapping">
    <p>Your ClawHub skill at <code>clawhub.ai/{handle}/{slug}</code> maps to:</p>
    <p><code>skill-history.com/{handle}/{slug}</code></p>
    <p style="margin-top:12px"><code>{handle}</code> is your GitHub username (ClawHub uses GitHub OAuth).</p>
    <p>So if your GitHub repo is <code>github.com/alice/my-skill</code> and it&rsquo;s published on ClawHub, your chart is at <code>skill-history.com/alice/my-skill</code>.</p>
  </div>
</section>

<section class="input-section">
  <h2>Generate your links</h2>
  <p>Paste a ClawHub URL, GitHub URL, or <code>handle/slug</code>:</p>
  <div class="input-row">
    <input type="text" id="skill-input" placeholder="clawhub.ai/gavinlinasd/self-preserve" autocomplete="off">
    <button onclick="generateLinks()">Generate</button>
  </div>
  <div id="link-error"></div>
  <div id="link-output">
    <div class="result-block">
      <label>Chart page</label>
      <pre><a id="out-page" href="#" target="_blank"></a></pre>
    </div>
    <div class="result-block">
      <label>SVG embed URL</label>
      <pre><a id="out-svg" href="#" target="_blank"></a></pre>
    </div>
    <div class="result-block">
      <label>Markdown embed</label>
      <pre id="out-md"></pre>
    </div>
  </div>
</section>

<section>
  <h2>Popular skills</h2>
  ${exampleCards}
</section>

<footer>
  Built by <a href="https://pineappleai.com">Pineapple AI</a> &middot; <a href="https://github.com/pineapple-farm/skill-history">Source</a>
</footer>

<script>
function generateLinks() {
  var raw = document.getElementById('skill-input').value.trim();
  var errorEl = document.getElementById('link-error');
  var outputEl = document.getElementById('link-output');
  errorEl.style.display = 'none';
  outputEl.style.display = 'none';

  if (!raw) {
    errorEl.textContent = 'Please enter a skill identifier.';
    errorEl.style.display = 'block';
    return;
  }

  // Strip protocol and www
  var cleaned = raw.replace(/^https?:\\/\\//, '').replace(/^www\\./, '');
  // Strip known host prefixes
  cleaned = cleaned.replace(/^clawhub\\.ai\\//, '').replace(/^github\\.com\\//, '');
  // Strip trailing slashes
  cleaned = cleaned.replace(/\\/+$/, '');

  var parts = cleaned.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    errorEl.textContent = 'Could not parse. Expected format: handle/slug';
    errorEl.style.display = 'block';
    return;
  }

  var handle = parts[0];
  var slug = parts[1];
  var pageUrl = 'https://skill-history.com/' + handle + '/' + slug;
  var svgUrl = 'https://skill-history.com/chart/' + handle + '/' + slug + '.svg';
  var md = '[![Download history](' + svgUrl + ')](' + pageUrl + ')';

  document.getElementById('out-page').href = pageUrl;
  document.getElementById('out-page').textContent = pageUrl;
  document.getElementById('out-svg').href = svgUrl;
  document.getElementById('out-svg').textContent = svgUrl;
  document.getElementById('out-md').textContent = md;
  outputEl.style.display = 'block';
}

document.getElementById('skill-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') generateLinks();
});
</script>
</body>
</html>`);
});

app.get("/robots.txt", (c) => {
  return c.text(
    `User-agent: *\nAllow: /\nSitemap: https://skill-history.com/sitemap.xml`,
  );
});

app.get("/sitemap.xml", async (c) => {
  // Curated: top 500 skills by downloads only. Full 54k sitemap risks
  // thin-content demotion since most pages have <7 days of data.
  // Expand once charts are data-rich.
  const { results } = await c.env.DB.prepare(
    `SELECT s.handle, s.slug FROM skills s
     JOIN snapshots sn ON sn.skill_id = s.id
     WHERE sn.captured_at = (SELECT MAX(captured_at) FROM snapshots)
     ORDER BY sn.downloads DESC
     LIMIT 500`,
  ).all<{ handle: string; slug: string }>();

  const urls = [
    `  <url><loc>https://skill-history.com/</loc></url>`,
    ...results.map(
      (r) =>
        `  <url><loc>https://skill-history.com/${r.handle}/${r.slug}</loc></url>`,
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
});

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
  "Cache-Control": "public, max-age=60, s-maxage=60",
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
    snapshots.length === 0
      ? renderEmptySvg(skill)
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
