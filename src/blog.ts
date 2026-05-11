import { fmtNum } from "./chart";

// Data starts April 16, 2026 (Thu). First complete ISO week = week of 2026-04-20 (Mon).
const DATA_START_MONDAY = "2026-04-20";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ---------- Date helpers (UTC, ISO week-aligned to Monday) ----------

function parseISODate(s: string): Date {
  // YYYY-MM-DD → UTC midnight
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

// Monday of the ISO week containing `d` (UTC)
function mondayOf(d: Date): Date {
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  // Monday = 1; how many days back to get to Monday
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(d, offset);
}

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Most recent Monday for a complete week (i.e. the Monday whose Sunday is <= yesterday)
export function latestCompleteMonday(): string {
  const today = todayUTC();
  // The last Sunday that's <= yesterday
  // Today is Tuesday → last complete week ends Sunday (yesterday-3 etc.)
  // Easier: most recent Monday such that monday + 6 < today (i.e. Sunday is in the past).
  let monday = mondayOf(today);
  // If today is in the same ISO week (Mon-Sun), step back 7 days.
  // We want the week whose Sunday < today.
  const sunday = addDays(monday, 6);
  if (sunday >= today) monday = addDays(monday, -7);
  return fmtISODate(monday);
}

// Format a (monday, sunday) range like "May 4-10, 2026" or "Apr 27 - May 3, 2026"
export function formatWeekRange(monday: string): string {
  const m = parseISODate(monday);
  const s = addDays(m, 6);
  const mY = m.getUTCFullYear();
  const sY = s.getUTCFullYear();
  const mMon = MONTH_NAMES[m.getUTCMonth()];
  const sMon = MONTH_NAMES[s.getUTCMonth()];
  if (mY !== sY) {
    return `${mMon} ${m.getUTCDate()}, ${mY} - ${sMon} ${s.getUTCDate()}, ${sY}`;
  }
  if (mMon !== sMon) {
    return `${mMon} ${m.getUTCDate()} - ${sMon} ${s.getUTCDate()}, ${mY}`;
  }
  return `${mMon} ${m.getUTCDate()}-${s.getUTCDate()}, ${mY}`;
}

// Long form for headers: "May 4, 2026"
export function formatLongDate(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// All Mondays from DATA_START_MONDAY up to and including the most recent complete week, newest first.
export function getCompletedWeeks(): string[] {
  const start = parseISODate(DATA_START_MONDAY);
  const last = parseISODate(latestCompleteMonday());
  const weeks: string[] = [];
  for (let d = new Date(last.getTime()); d >= start; d = addDays(d, -7)) {
    weeks.push(fmtISODate(d));
  }
  return weeks;
}

// Returns true if monday is the current (in-progress) ISO week.
export function isCurrentWeek(monday: string): boolean {
  const m = parseISODate(monday);
  const todayMonday = mondayOf(todayUTC());
  return m.getTime() === todayMonday.getTime();
}

// Validate: monday must be a Monday, in-range (>= DATA_START_MONDAY, <= today's monday)
export function isValidWeekStart(monday: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) return false;
  const d = parseISODate(monday);
  if (isNaN(d.getTime())) return false;
  if (d.getUTCDay() !== 1) return false;
  if (monday < DATA_START_MONDAY) return false;
  const todayMonday = mondayOf(todayUTC());
  if (d > todayMonday) return false;
  return true;
}

export function previousWeek(monday: string): string | null {
  const prev = addDays(parseISODate(monday), -7);
  if (fmtISODate(prev) < DATA_START_MONDAY) return null;
  return fmtISODate(prev);
}

export function nextWeek(monday: string): string | null {
  const next = addDays(parseISODate(monday), 7);
  const todayMonday = mondayOf(todayUTC());
  if (next > todayMonday) return null;
  return fmtISODate(next);
}

// ---------- HTML helpers ----------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pageShell(opts: {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  jsonLd?: string;
  body: string;
  gaTag: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
${opts.gaTag}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23f97316'/><polyline points='6,22 12,18 18,14 26,8' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/></svg>">
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeHtml(opts.description)}">
<link rel="canonical" href="${opts.canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(opts.title)}">
<meta property="og:description" content="${escapeHtml(opts.description)}">
<meta property="og:url" content="${opts.canonical}">
${opts.ogImage ? `<meta property="og:image" content="${opts.ogImage}">` : ""}
<meta name="twitter:card" content="summary_large_image">
${opts.jsonLd ? `<script type="application/ld+json">${opts.jsonLd}</script>` : ""}
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #111827; line-height: 1.5; }
  h1 { margin: 0 0 4px; font-size: 28px; }
  .lede { color: #6b7280; font-size: 16px; margin: 0 0 32px; }
  h2 { font-size: 18px; margin: 36px 0 12px; }
  h3 { font-size: 15px; margin: 24px 0 8px; }
  a { color: #f97316; text-decoration: none; }
  a:hover { text-decoration: underline; }
  ol.lb { list-style: none; counter-reset: rank; padding: 0; margin: 12px 0; }
  ol.lb li { counter-increment: rank; display: flex; align-items: baseline; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
  ol.lb li::before { content: counter(rank); font-weight: 600; color: #9ca3af; min-width: 18px; font-size: 14px; }
  .lb-main { flex: 1; min-width: 0; }
  .lb-name { font-weight: 600; }
  .lb-meta { color: #6b7280; font-size: 13px; }
  .lb-stat { color: #f97316; font-weight: 600; font-size: 14px; white-space: nowrap; }
  .empty { color: #6b7280; font-style: italic; padding: 8px 0; }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
  .stats > div { padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
  .stats .num { font-size: 20px; font-weight: 600; color: #111827; }
  .stats .label { color: #6b7280; font-size: 13px; }
  nav.weekly { display: flex; justify-content: space-between; gap: 12px; margin: 32px 0 0; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 14px; }
  nav.weekly a { color: #6b7280; }
  .post-list { padding: 0; list-style: none; margin: 16px 0; }
  .post-list li { padding: 16px 0; border-bottom: 1px solid #f3f4f6; }
  .post-list .post-date { color: #6b7280; font-size: 13px; margin-bottom: 4px; }
  .post-list .post-title { font-weight: 600; font-size: 16px; }
  .post-list .post-desc { color: #6b7280; font-size: 14px; margin-top: 4px; }
  .badge-progress { display: inline-block; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-left: 8px; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 13px; }
  footer a { color: #6b7280; }
  @media (prefers-color-scheme: dark) {
    body { color: #e5e7eb; background: #0f172a; }
    .lede, footer, footer a { color: #9ca3af; }
    h1, h2, h3 { color: #e5e7eb; }
    ol.lb li { border-bottom-color: #1e293b; }
    .lb-name { color: #e5e7eb; }
    .stats > div { border-color: #1e293b; }
    .stats .num { color: #e5e7eb; }
    .post-list li { border-bottom-color: #1e293b; }
    .badge-progress { background: #422006; color: #fde68a; }
    nav.weekly { border-top-color: #1e293b; }
  }
</style>
</head>
<body>
${opts.body}
<footer>
  <a href="/">Home</a> &middot; <a href="/blog">Blog</a> &middot; <a href="/faq">FAQ</a> &middot; Built by <a href="https://pineappleai.com">Pineapple AI</a> &middot; <a href="https://github.com/pineapple-farm/skill-history">Source</a> &middot; <a href="https://clawhub.ai">ClawHub</a>
</footer>
</body>
</html>`;
}

// ---------- Queries ----------

type SkillRow = { handle: string; slug: string; display_name: string | null };

type GrowthRow = SkillRow & { dl_start: number; dl_end: number };
type NewSkillRow = SkillRow & { current_dl: number; first_seen: string };

async function getEffectiveEnd(
  db: D1Database,
  weekEnd: string,
): Promise<string | null> {
  // Use the latest captured_at <= weekEnd.
  const row = await db
    .prepare(
      "SELECT MAX(captured_at) AS d FROM snapshots WHERE captured_at <= ?",
    )
    .bind(weekEnd)
    .first<{ d: string | null }>();
  return row?.d ?? null;
}

async function getEffectiveStart(
  db: D1Database,
  weekStart: string,
): Promise<string | null> {
  // Use the earliest captured_at >= weekStart.
  const row = await db
    .prepare(
      "SELECT MIN(captured_at) AS d FROM snapshots WHERE captured_at >= ?",
    )
    .bind(weekStart)
    .first<{ d: string | null }>();
  return row?.d ?? null;
}

async function getFastestGrowing(
  db: D1Database,
  startDate: string,
  endDate: string,
): Promise<GrowthRow[]> {
  const { results } = await db
    .prepare(
      `WITH ss AS (
         SELECT skill_id, downloads AS dl_start FROM snapshots WHERE captured_at = ?
       ),
       es AS (
         SELECT skill_id, downloads AS dl_end FROM snapshots WHERE captured_at = ?
       )
       SELECT s.handle, s.slug, s.display_name, ss.dl_start, es.dl_end,
              ROUND((es.dl_end - ss.dl_start) * 100.0 / ss.dl_start, 1) AS pct
       FROM ss
       JOIN es ON es.skill_id = ss.skill_id
       JOIN skills s ON s.id = ss.skill_id
       WHERE ss.dl_start >= 1000
         AND s.source = 'clawhub'
         AND es.dl_end > ss.dl_start
         AND LENGTH(s.slug) <= 80
       ORDER BY pct DESC
       LIMIT 5`,
    )
    .bind(startDate, endDate)
    .all<GrowthRow & { pct: number }>();
  return results ?? [];
}

async function getMostAdded(
  db: D1Database,
  startDate: string,
  endDate: string,
): Promise<GrowthRow[]> {
  const { results } = await db
    .prepare(
      `WITH ss AS (
         SELECT skill_id, downloads AS dl_start FROM snapshots WHERE captured_at = ?
       ),
       es AS (
         SELECT skill_id, downloads AS dl_end FROM snapshots WHERE captured_at = ?
       )
       SELECT s.handle, s.slug, s.display_name, ss.dl_start, es.dl_end
       FROM ss
       JOIN es ON es.skill_id = ss.skill_id
       JOIN skills s ON s.id = ss.skill_id
       WHERE s.source = 'clawhub'
         AND es.dl_end > ss.dl_start
         AND LENGTH(s.slug) <= 80
       ORDER BY (es.dl_end - ss.dl_start) DESC
       LIMIT 5`,
    )
    .bind(startDate, endDate)
    .all<GrowthRow>();
  return results ?? [];
}

async function getHotNewSkills(
  db: D1Database,
  weekStart: string,
  weekEnd: string,
): Promise<NewSkillRow[]> {
  const { results } = await db
    .prepare(
      `SELECT s.handle, s.slug, s.display_name,
              MIN(sn.captured_at) AS first_seen,
              (SELECT downloads FROM snapshots WHERE skill_id = s.id ORDER BY captured_at DESC LIMIT 1) AS current_dl
       FROM skills s
       JOIN snapshots sn ON sn.skill_id = s.id
       WHERE s.source = 'clawhub'
         AND LENGTH(s.slug) <= 80
       GROUP BY s.id
       HAVING first_seen >= ? AND first_seen <= ?
       ORDER BY current_dl DESC
       LIMIT 5`,
    )
    .bind(weekStart, weekEnd)
    .all<NewSkillRow>();
  return results ?? [];
}

type EcosystemStats = {
  catalog_start: number;
  catalog_end: number;
  total_added: number;
};

async function getEcosystemStats(
  db: D1Database,
  startDate: string,
  endDate: string,
): Promise<EcosystemStats> {
  const start = await db
    .prepare(
      "SELECT COUNT(*) AS cnt FROM snapshots WHERE captured_at = ?",
    )
    .bind(startDate)
    .first<{ cnt: number }>();
  const end = await db
    .prepare(
      "SELECT COUNT(*) AS cnt FROM snapshots WHERE captured_at = ?",
    )
    .bind(endDate)
    .first<{ cnt: number }>();
  const delta = await db
    .prepare(
      `WITH ss AS (
         SELECT skill_id, downloads AS dl_start FROM snapshots WHERE captured_at = ?
       ),
       es AS (
         SELECT skill_id, downloads AS dl_end FROM snapshots WHERE captured_at = ?
       )
       SELECT COALESCE(SUM(es.dl_end - ss.dl_start), 0) AS added
       FROM ss JOIN es ON es.skill_id = ss.skill_id
       WHERE es.dl_end > ss.dl_start`,
    )
    .bind(startDate, endDate)
    .first<{ added: number }>();
  return {
    catalog_start: start?.cnt ?? 0,
    catalog_end: end?.cnt ?? 0,
    total_added: delta?.added ?? 0,
  };
}

// ---------- Renderers ----------

function skillUrl(s: SkillRow): string {
  return `/${s.handle}/${s.slug}`;
}

function skillName(s: SkillRow): string {
  return s.display_name && s.display_name.trim()
    ? s.display_name
    : s.slug;
}

function renderLeaderboard(items: { row: SkillRow; stat: string }[]): string {
  if (items.length === 0) {
    return `<p class="empty">No skills qualified this week.</p>`;
  }
  return `<ol class="lb">${items
    .map((item) => {
      return `<li>
        <div class="lb-main">
          <div class="lb-name"><a href="${skillUrl(item.row)}">${escapeHtml(skillName(item.row))}</a></div>
          <div class="lb-meta">${escapeHtml(item.row.handle)}</div>
        </div>
        <div class="lb-stat">${item.stat}</div>
      </li>`;
    })
    .join("")}</ol>`;
}

function pctStr(g: GrowthRow & { pct?: number }): string {
  const pct = "pct" in g && typeof g.pct === "number"
    ? g.pct
    : Math.round(((g.dl_end - g.dl_start) * 1000) / g.dl_start) / 10;
  return `+${pct.toLocaleString("en-US")}% (${fmtNum(g.dl_start)} → ${fmtNum(g.dl_end)})`;
}

function deltaStr(g: GrowthRow): string {
  return `+${(g.dl_end - g.dl_start).toLocaleString("en-US")} (${fmtNum(g.dl_end)} total)`;
}

function newSkillStr(n: NewSkillRow): string {
  return `${(n.current_dl ?? 0).toLocaleString("en-US")} downloads`;
}

export type WeeklyPostData = {
  monday: string;
  inProgress: boolean;
  growing: GrowthRow[];
  added: GrowthRow[];
  newSkills: NewSkillRow[];
  stats: EcosystemStats;
};

export async function loadWeeklyPostData(
  db: D1Database,
  monday: string,
): Promise<WeeklyPostData | null> {
  if (!isValidWeekStart(monday)) return null;
  const sundayDate = fmtISODate(addDays(parseISODate(monday), 6));
  const inProgress = isCurrentWeek(monday);

  // Resolve effective snapshot dates we actually have data for.
  const effectiveStart = await getEffectiveStart(db, monday);
  const effectiveEnd = await getEffectiveEnd(db, sundayDate);
  if (!effectiveStart || !effectiveEnd) return null;
  // For an in-progress week we may have effectiveEnd < sundayDate; still valid.
  // But if effectiveStart > sundayDate it means there's no data in this week at all.
  if (effectiveStart > sundayDate) return null;

  const [growing, added, newSkills, stats] = await Promise.all([
    inProgress && effectiveStart === effectiveEnd
      ? Promise.resolve([] as GrowthRow[])
      : getFastestGrowing(db, effectiveStart, effectiveEnd),
    inProgress && effectiveStart === effectiveEnd
      ? Promise.resolve([] as GrowthRow[])
      : getMostAdded(db, effectiveStart, effectiveEnd),
    getHotNewSkills(db, monday, sundayDate),
    getEcosystemStats(db, effectiveStart, effectiveEnd),
  ]);

  return { monday, inProgress, growing, added, newSkills, stats };
}

export function renderWeeklyTrendingPostHtml(
  data: WeeklyPostData,
  gaTag: string,
): string {
  const { monday, inProgress, growing, added, newSkills, stats } = data;
  const sunday = fmtISODate(addDays(parseISODate(monday), 6));
  const range = formatWeekRange(monday);
  const slug = `trending-openclaw-skills-week-of-${monday}`;
  const canonical = `https://skill-history.com/blog/${slug}`;
  const ogImage = `https://skill-history.com/og/blog/${slug}.png`;

  // Top 1-2 skills for meta description
  const topGrowing = growing[0]
    ? `${skillName(growing[0])} grew ${pctStr(growing[0] as GrowthRow & { pct: number })}`
    : null;
  const topAdded = added[0]
    ? `${skillName(added[0])} added ${(added[0].dl_end - added[0].dl_start).toLocaleString("en-US")} downloads`
    : null;
  const description = inProgress
    ? `In-progress weekly trending leaderboard for ClawHub agent skills, week of ${range}.`
    : [topGrowing, topAdded].filter(Boolean).join(". ") +
      (topGrowing || topAdded
        ? ` and more in this week's ClawHub trending leaderboard.`
        : `Weekly trending ClawHub agent skills leaderboard for ${range}.`);

  const title = `Trending OpenClaw Skills — Week of ${formatLongDate(monday)} | skill-history.com`;
  const heading = `Trending OpenClaw Skills — Week of ${formatLongDate(monday)}`;

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `Trending OpenClaw Skills — Week of ${formatLongDate(monday)}`,
    datePublished: `${fmtISODate(addDays(parseISODate(monday), 7))}T00:00:00Z`,
    dateModified: `${sunday}T23:59:59Z`,
    author: { "@type": "Organization", name: "Pineapple AI", url: "https://pineappleai.com" },
    publisher: {
      "@type": "Organization",
      name: "Pineapple AI",
      url: "https://pineappleai.com",
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    image: ogImage,
    description,
  });

  const prev = previousWeek(monday);
  const next = nextWeek(monday);

  const navHtml = `<nav class="weekly">
  <span>${prev ? `<a href="/blog/trending-openclaw-skills-week-of-${prev}">← Previous week (${formatWeekRange(prev)})</a>` : ""}</span>
  <span><a href="/blog">All posts</a></span>
  <span>${next ? `<a href="/blog/trending-openclaw-skills-week-of-${next}">Next week (${formatWeekRange(next)}) →</a>` : ""}</span>
</nav>`;

  const growingItems = growing.map((g) => ({
    row: g,
    stat: pctStr(g as GrowthRow & { pct: number }),
  }));
  const addedItems = added.map((g) => ({ row: g, stat: deltaStr(g) }));
  const newItems = newSkills.map((n) => ({ row: n, stat: newSkillStr(n) }));

  const inProgressBadge = inProgress
    ? `<span class="badge-progress">In progress</span>`
    : "";

  const catalogDelta = stats.catalog_end - stats.catalog_start;
  const catalogDeltaStr = catalogDelta >= 0 ? `+${catalogDelta.toLocaleString("en-US")}` : catalogDelta.toLocaleString("en-US");

  const body = `
<h1><a href="/" style="color:inherit;text-decoration:none;">skill-history.com</a></h1>
<p style="margin: 4px 0 0; color: #6b7280; font-size: 13px;"><a href="/blog">Blog</a> · ${escapeHtml(range)}</p>

<h2 style="margin-top:24px;">${escapeHtml(heading)}${inProgressBadge}</h2>
<p class="lede">A 7-day snapshot of the ClawHub skill ecosystem.</p>

<section>
  <h3>📈 Fastest Growing <span style="color:#9ca3af;font-weight:400;font-size:13px;">(by % change, ≥1,000 downloads at start)</span></h3>
  ${inProgress && growingItems.length === 0
    ? `<p class="empty">Week is still in progress — % growth will be available after the week ends.</p>`
    : renderLeaderboard(growingItems)}
</section>

<section>
  <h3>🚀 Most Downloads Added <span style="color:#9ca3af;font-weight:400;font-size:13px;">(absolute delta)</span></h3>
  ${inProgress && addedItems.length === 0
    ? `<p class="empty">Week is still in progress.</p>`
    : renderLeaderboard(addedItems)}
</section>

<section>
  <h3>🆕 Hot New Skills <span style="color:#9ca3af;font-weight:400;font-size:13px;">(first seen this week)</span></h3>
  ${renderLeaderboard(newItems)}
</section>

<section>
  <h3>📊 Ecosystem Stats</h3>
  <div class="stats">
    <div>
      <div class="num">${stats.catalog_end.toLocaleString("en-US")}</div>
      <div class="label">Catalog size <span style="color:#10b981;">${catalogDeltaStr}</span> this week</div>
    </div>
    <div>
      <div class="num">${stats.total_added.toLocaleString("en-US")}</div>
      <div class="label">Total downloads added</div>
    </div>
  </div>
</section>

${navHtml}
`;

  return pageShell({
    title,
    description: description.slice(0, 200),
    canonical,
    ogImage,
    jsonLd,
    body,
    gaTag,
  });
}

export function renderBlogIndexHtml(gaTag: string): string {
  const weeks = getCompletedWeeks();
  const items = weeks
    .map((monday) => {
      const slug = `trending-openclaw-skills-week-of-${monday}`;
      const range = formatWeekRange(monday);
      return `<li>
        <div class="post-date">${escapeHtml(range)}</div>
        <div class="post-title"><a href="/blog/${slug}">Trending OpenClaw Skills</a></div>
        <div class="post-desc">The fastest growing, biggest jumps, and freshest skills from the past week.</div>
      </li>`;
    })
    .join("");

  const body = `
<h1><a href="/" style="color:inherit;text-decoration:none;">skill-history.com</a> — Blog</h1>
<p class="lede">Auto-generated weekly snapshots of the ClawHub agent skill ecosystem.</p>

<ul class="post-list">${items}</ul>
`;

  return pageShell({
    title: "Blog — skill-history.com",
    description:
      "Weekly trending leaderboards for ClawHub agent skills: fastest growing, biggest jumps, and newly published skills.",
    canonical: "https://skill-history.com/blog",
    body,
    gaTag,
  });
}

export function renderBlogPostNotFoundHtml(gaTag: string): string {
  const body = `
<h1>Post not found</h1>
<p class="lede">We couldn&rsquo;t find that blog post. <a href="/blog">See all posts</a>.</p>
`;
  return pageShell({
    title: "Post not found — skill-history.com",
    description: "Blog post not found.",
    canonical: "https://skill-history.com/blog",
    body,
    gaTag,
  });
}

// OG image HTML for /og/blog/{slug}.png
export function renderBlogOgHtml(data: WeeklyPostData): string {
  const { monday, growing } = data;
  const range = formatWeekRange(monday);
  const top3 = growing
    .slice(0, 3)
    .map((g) => `<div class="skill">${escapeHtml(skillName(g))}</div>`)
    .join("");

  return `<!DOCTYPE html>
<html><head>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { width: 1200px; height: 630px; background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); padding: 60px 80px; display: flex; flex-direction: column; justify-content: space-between; }
  .top { }
  .badge { display: inline-block; background: #f97316; color: white; padding: 6px 14px; border-radius: 6px; font-size: 18px; font-weight: 600; letter-spacing: 0.5px; }
  h1 { font-size: 72px; font-weight: 700; color: #111827; margin-top: 24px; line-height: 1.1; letter-spacing: -1px; }
  .sub { font-size: 32px; color: #ea580c; margin-top: 12px; font-weight: 500; }
  .skills { margin-top: 32px; }
  .skills-label { font-size: 18px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; margin-bottom: 12px; }
  .skill { font-size: 28px; color: #111827; padding: 6px 0; font-weight: 500; }
  .skill::before { content: "→ "; color: #f97316; }
  .footer { display: flex; justify-content: space-between; align-items: center; }
  .brand { font-size: 22px; font-weight: 600; color: #111827; }
  .brand-sub { font-size: 16px; color: #6b7280; }
  .arrow { font-size: 56px; color: #f97316; }
</style>
</head><body>
<div class="top">
  <span class="badge">TRENDING</span>
  <h1>OpenClaw Skills</h1>
  <div class="sub">Week of ${range}</div>
  ${
    top3
      ? `<div class="skills"><div class="skills-label">Fastest growing</div>${top3}</div>`
      : ""
  }
</div>
<div class="footer">
  <div>
    <div class="brand">skill-history.com</div>
    <div class="brand-sub">by Pineapple AI</div>
  </div>
  <div class="arrow">📈</div>
</div>
</body></html>`;
}
