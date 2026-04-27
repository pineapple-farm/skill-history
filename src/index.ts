import { Hono } from "hono";
import puppeteer from "@cloudflare/puppeteer";
import { runSweep } from "./sweep";
import { runSkillsshSweep } from "./sweep-skillssh";
import {
  renderChartPageHtml,
  renderChartSvg,
  renderEmptySvg,
  renderNotFoundSvg,
  fmtNum,
  type Snapshot,
  type SkillMeta,
} from "./chart";
import { createMcpHandler } from "./mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

type Env = {
  DB: D1Database;
  BROWSER: Fetcher;
};

const GA_TAG = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-06QZRBETMR"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-06QZRBETMR');</script>`;

const app = new Hono<{ Bindings: Env }>();

// In-memory TTL cache for GitHub repo existence checks.
// Workers in-memory cache resets per isolate — best-effort, good enough for launch.
const githubCache = new Map<string, { exists: boolean; ts: number }>();
const GITHUB_CACHE_TTL = 3600000; // 1 hour

function getCachedGithubExists(handle: string, slug: string): boolean | null {
  const key = `${handle}/${slug}`;
  const entry = githubCache.get(key);
  if (entry && Date.now() - entry.ts < GITHUB_CACHE_TTL) return entry.exists;
  return null;
}

function setCachedGithubExists(handle: string, slug: string, exists: boolean): void {
  githubCache.set(`${handle}/${slug}`, { exists, ts: Date.now() });
}

app.get("/", async (c) => {
  const featured = [
    { handle: "gavinlinasd", slug: "self-preserve" },
    { handle: "aeoess", slug: "agent-passport-system" },
  ];

  const featuredCards = featured
    .map(
      (e) => `
      <div class="chart">
        <a href="/${e.handle}/${e.slug}">
          <img src="/chart/${e.handle}/${e.slug}.svg" alt="Download history for ${e.handle}/${e.slug}" loading="lazy">
        </a>
      </div>`,
    )
    .join("");

  // Trending: highest % growth, comparing latest snapshot vs oldest available
  // (ideally 7 days back, falls back to whatever earliest we have)
  let trendingResults: Array<{ handle: string; slug: string; display_name: string | null; growth_pct: number }> = [];
  try {
    const trending = await c.env.DB.prepare(
      `SELECT s.handle, s.slug, s.display_name,
              latest.downloads AS dl_now,
              older.downloads AS dl_then,
              CASE WHEN older.downloads > 0
                THEN ROUND((latest.downloads - older.downloads) * 100.0 / older.downloads, 1)
                ELSE 0 END AS growth_pct
       FROM skills s
       JOIN snapshots latest ON latest.skill_id = s.id
         AND latest.captured_at = (SELECT MAX(captured_at) FROM snapshots)
       JOIN snapshots older ON older.skill_id = s.id
         AND older.captured_at = (SELECT MIN(captured_at) FROM snapshots)
       WHERE older.downloads >= 1000
         AND latest.downloads > older.downloads
       ORDER BY growth_pct DESC
       LIMIT 2`,
    ).all<{ handle: string; slug: string; display_name: string | null; growth_pct: number }>();
    trendingResults = trending.results ?? [];
  } catch (err) {
    console.error("[homepage] trending query failed, skipping section", err);
  }

  const trendingCards = trendingResults
    .map(
      (e) => `
      <div class="chart">
        <a href="/${e.handle}/${e.slug}">
          <img src="/chart/${e.handle}/${e.slug}.svg" alt="Download history for ${e.handle}/${e.slug}" loading="lazy">
        </a>
      </div>`,
    )
    .join("");

  c.header("Cache-Control", "public, max-age=300, s-maxage=300");
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
${GA_TAG}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23f97316'/><polyline points='6,22 12,18 18,14 26,8' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/></svg>">
<title>skill-history.com — download history for agent skills</title>
<meta name="description" content="Like star-history, but for ClawHub downloads. Free download tracking and charts for all 54,000+ ClawHub skills. Embed a badge or history chart in your README in seconds.">
<link rel="canonical" href="https://skill-history.com/">
<meta property="og:type" content="website">
<meta property="og:title" content="skill-history.com — download history for agent skills">
<meta property="og:description" content="Like star-history, but for ClawHub downloads. Free download tracking and charts for all 54,000+ ClawHub skills. Embed a badge or history chart in your README in seconds.">
<meta property="og:url" content="https://skill-history.com/">
<meta property="og:image" content="https://raw.githubusercontent.com/pineapple-farm/skill-history/main/public/og-image.jpg">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "skill-history.com",
  "url": "https://skill-history.com",
  "description": "Like star-history, but for ClawHub downloads. Free download tracking and charts for all 54,000+ ClawHub skills.",
  "publisher": {
    "@type": "Organization",
    "name": "Pineapple AI",
    "url": "https://pineappleai.com"
  }
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Why does data only start from April 2026?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "ClawHub doesn't provide historical download data — only a current cumulative total. Unlike GitHub stars (which have timestamps, letting star-history reconstruct a full history), ClawHub downloads are a single counter with no event log. We started recording daily snapshots on April 16, 2026. The longer we run, the richer the charts get."
      }
    },
    {
      "@type": "Question",
      "name": "How is this different from star-history.com?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Star-history tracks GitHub stars, which have timestamps — so they can reconstruct a full history back to day one. ClawHub downloads don't have timestamps, so we can only track from the day we started polling. Think of it as: star-history looks backward, skill-history looks forward."
      }
    },
    {
      "@type": "Question",
      "name": "Will my chart keep updating?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. We poll every skill on ClawHub multiple times per day and store a daily snapshot. Your chart updates automatically — no setup, no tokens, no maintenance on your end."
      }
    },
    {
      "@type": "Question",
      "name": "My skill isn't showing up?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We track all 54,000+ skills on ClawHub. If your skill was recently published, it should appear within a few hours. If it still doesn't show, open an issue."
      }
    },
    {
      "@type": "Question",
      "name": "Will you track skills from other registries?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes — skill-history is built to be registry-agnostic. ClawHub is the starting point since it's where the agent skill ecosystem is most concentrated today. Support for additional registries is on the roadmap."
      }
    }
  ]
}
</script>
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
  .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 600px) { .chart-grid { grid-template-columns: 1fr; } }
  .chart { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: white; }
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
  .arrow { color: #9ca3af; margin: 0 4px; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 13px; }
  footer a { color: #6b7280; }
  @media (prefers-color-scheme: dark) {
    body { color: #e5e7eb; background: #0f172a; }
    .tagline, footer, footer a { color: #9ca3af; }
    code { background: #1e293b; }
    pre { background: #1e293b; }
    .chart { border-color: #334155; background: white; }
    .input-row input { background: #1e293b; border-color: #334155; color: #e5e7eb; }
    #link-output label { color: #9ca3af; }
    #link-error { color: #f87171; }
  }
</style>
</head>
<body>
<header>
  <h1>Download analytics for every ClawHub skill</h1>
  <p class="tagline">Like star-history, but for ClawHub downloads. Track 54,000+ skills — free, no signup, no tokens.</p>
  <p style="color:#9ca3af;font-size:13px;margin:4px 0 0;">Starting with ClawHub. More skill registries coming.</p>
  <p style="color:#9ca3af;font-size:13px;margin:2px 0 0;">🔌 <a href="/llms.txt" style="color:#9ca3af;">MCP compatible</a> — connect your AI agent directly.</p>
</header>

<div style="margin:24px 0;padding:12px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:14px;">
  📣 <strong>Launch post:</strong> <a href="https://gavinpineapple.substack.com/p/i-built-skill-historycom-the-missing" style="color:#f97316;">I built skill-history.com — the missing download tracker for agent skills</a>
</div>

<section>
  <h2>Featured Skills</h2>
  <div class="chart-grid">${featuredCards}</div>
</section>

${trendingCards ? `<section>
  <h2>Trending on ClawHub</h2>
  <div class="chart-grid">${trendingCards}</div>
</section>` : ""}

<section class="input-section">
  <h2>Find your skill</h2>
  <p>Paste a ClawHub URL, GitHub URL, or <code>handle/slug</code> to get your chart and embed code.</p>
  <div class="input-row">
    <input type="text" id="skill-input" placeholder="clawhub.ai/gavinlinasd/self-preserve" autocomplete="off">
    <button onclick="generateLinks()">Go</button>
  </div>
  <div id="link-error"></div>
  <div id="link-output">
    <div class="result-block">
      <label>Chart page</label>
      <pre><a id="out-page" href="#" target="_blank"></a></pre>
    </div>
    <div class="result-block">
      <label>Markdown embed</label>
      <pre id="out-md"></pre>
    </div>
  </div>
</section>

<section>
  <h2>FAQ</h2>
  <h3>Why does data only start from April 2026?</h3>
  <p>ClawHub doesn&rsquo;t provide historical download data &mdash; only a current cumulative total. Unlike GitHub stars (which have timestamps, letting star-history reconstruct a full history), ClawHub downloads are a single counter with no event log. We started recording daily snapshots on April 16, 2026. The longer we run, the richer the charts get.</p>
  <h3>How is this different from star-history.com?</h3>
  <p>Star-history tracks GitHub stars, which have timestamps &mdash; so they can reconstruct a full history back to day one. ClawHub downloads don&rsquo;t have timestamps, so we can only track from the day we started polling. Think of it as: star-history looks backward, skill-history looks forward.</p>
  <h3>Will my chart keep updating?</h3>
  <p>Yes. We poll every skill on ClawHub multiple times per day and store a daily snapshot. Your chart updates automatically &mdash; no setup, no tokens, no maintenance on your end.</p>
  <h3>How do I find my skill?</h3>
  <p>Your ClawHub skill at <code>clawhub.ai/{handle}/{slug}</code> maps directly to <code>skill-history.com/{handle}/{slug}</code>. Your <code>{handle}</code> is your GitHub username (ClawHub uses GitHub OAuth). Or just paste your ClawHub or GitHub URL in the search box above.</p>
  <h3>My skill isn&rsquo;t showing up?</h3>
  <p>We track all 54,000+ skills on ClawHub. If your skill was recently published, it should appear within a few hours. If it still doesn&rsquo;t show, <a href="https://github.com/pineapple-farm/skill-history/issues/new">open an issue</a>.</p>
  <h3>Will you track skills from other registries?</h3>
  <p>Yes &mdash; skill-history is built to be registry-agnostic. ClawHub is the starting point since it&rsquo;s where the agent skill ecosystem is most concentrated today. Support for additional registries is on the roadmap.</p>
</section>

<div style="text-align:center;margin:24px 0;"><img src="https://raw.githubusercontent.com/pineapple-farm/skill-history/main/public/og-image.jpg" alt="Skills stonks" style="max-width:300px;border-radius:8px;width:100%;"></div>

<footer>
  Built by <a href="https://pineappleai.com">Pineapple AI</a> &middot; <a href="/faq">FAQ</a> &middot; <a href="https://gavinpineapple.substack.com/p/i-built-skill-historycom-the-missing">Blog</a> &middot; <a href="https://github.com/pineapple-farm/skill-history">Source</a> &middot; <a href="https://clawhub.ai">ClawHub</a>
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

app.get("/faq", (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
${GA_TAG}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23f97316'/><polyline points='6,22 12,18 18,14 26,8' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/></svg>">
<title>FAQ — skill-history.com</title>
<meta name="description" content="How skill-history tracks ClawHub download data, why historical data starts April 2026, and how to embed charts in your README.">
<link rel="canonical" href="https://skill-history.com/faq">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Why does data only start from April 2026?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "ClawHub doesn't provide historical download data — only a current cumulative total. Unlike GitHub stars (which have timestamps, letting star-history reconstruct a full history), ClawHub downloads are a single counter with no event log. We started recording daily snapshots on April 16, 2026. The longer we run, the richer the charts get."
      }
    },
    {
      "@type": "Question",
      "name": "How is this different from star-history.com?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Star-history tracks GitHub stars, which have timestamps — so they can reconstruct a full history back to day one. ClawHub downloads don't have timestamps, so we can only track from the day we started polling. Think of it as: star-history looks backward, skill-history looks forward. We're building the history that doesn't exist yet."
      }
    },
    {
      "@type": "Question",
      "name": "Will my chart keep updating?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. We poll every skill on ClawHub multiple times per day and store a daily snapshot. Your chart updates automatically — no setup, no tokens, no maintenance on your end."
      }
    },
    {
      "@type": "Question",
      "name": "My skill isn't showing up?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We track all 54,000+ skills on ClawHub. If your skill was recently published, it should appear within a few hours on the next sweep. If it still doesn't show, open an issue."
      }
    },
    {
      "@type": "Question",
      "name": "Will you track skills from other registries?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes — skill-history is built to be registry-agnostic. ClawHub is the starting point since it's where the agent skill ecosystem is most concentrated today. Support for additional registries is on the roadmap."
      }
    },
    {
      "@type": "Question",
      "name": "What metrics do you track?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We capture daily downloads (cumulative) and installs_all_time from ClawHub. The chart shows downloads by default. We're exploring additional sources like GitHub clone traffic for skills distributed outside ClawHub."
      }
    },
    {
      "@type": "Question",
      "name": "Is this open source?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. The entire codebase is at github.com/pineapple-farm/skill-history. Feature requests, bug reports, and PRs are welcome."
      }
    }
  ]
}
</script>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #111827; line-height: 1.6; }
  h1 { margin: 0 0 24px; font-size: 24px; }
  h3 { margin: 32px 0 8px; font-size: 16px; }
  p { font-size: 15px; margin: 0 0 12px; }
  a { color: #f97316; text-decoration: none; }
  a:hover { text-decoration: underline; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 13px; }
  footer a { color: #6b7280; }
  @media (prefers-color-scheme: dark) {
    body { color: #e5e7eb; background: #0f172a; }
    footer, footer a { color: #9ca3af; }
  }
</style>
</head>
<body>
<h1><a href="/" style="color:inherit;text-decoration:none;">skill-history.com</a> — FAQ</h1>

<h3>Why does data only start from April 2026?</h3>
<p>ClawHub doesn&rsquo;t provide historical download data &mdash; only a current cumulative total. Unlike GitHub stars (which have timestamps, letting star-history reconstruct a full history), ClawHub downloads are a single counter with no event log. We started recording daily snapshots on April 16, 2026. The longer we run, the richer the charts get.</p>

<h3>How is this different from star-history.com?</h3>
<p>Star-history tracks GitHub stars, which have timestamps &mdash; so they can reconstruct a full history back to day one. ClawHub downloads don&rsquo;t have timestamps, so we can only track from the day we started polling. Think of it as: star-history looks backward, skill-history looks forward. We&rsquo;re building the history that doesn&rsquo;t exist yet.</p>

<h3>Will my chart keep updating?</h3>
<p>Yes. We poll every skill on ClawHub multiple times per day and store a daily snapshot. Your chart updates automatically &mdash; no setup, no tokens, no maintenance on your end.</p>

<h3>My skill isn&rsquo;t showing up?</h3>
<p>We track all 54,000+ skills on ClawHub. If your skill was recently published, it should appear within a few hours on the next sweep. If it still doesn&rsquo;t show, <a href="https://github.com/pineapple-farm/skill-history/issues/new">open an issue</a>.</p>

<h3>Will you track skills from other registries?</h3>
<p>Yes &mdash; skill-history is built to be registry-agnostic. ClawHub is the starting point since it&rsquo;s where the agent skill ecosystem is most concentrated today. Support for additional registries is on the roadmap.</p>

<h3>What metrics do you track?</h3>
<p>We capture daily downloads (cumulative) and installs_all_time from ClawHub. The chart shows downloads by default. We&rsquo;re exploring additional sources like GitHub clone traffic for skills distributed outside ClawHub.</p>

<h3>Is this open source?</h3>
<p>Yes. The entire codebase is at <a href="https://github.com/pineapple-farm/skill-history">github.com/pineapple-farm/skill-history</a>. Feature requests, bug reports, and PRs are welcome.</p>

<footer>
  <a href="/">Home</a> &middot; Built by <a href="https://pineappleai.com">Pineapple AI</a> &middot; <a href="/faq">FAQ</a> &middot; <a href="https://gavinpineapple.substack.com/p/i-built-skill-historycom-the-missing">Blog</a> &middot; <a href="https://github.com/pineapple-farm/skill-history">Source</a> &middot; <a href="https://clawhub.ai">ClawHub</a>
</footer>
</body>
</html>`);
});

app.get("/robots.txt", (c) => {
  return c.text(
    `User-agent: *\nAllow: /\nSitemap: https://skill-history.com/sitemap.xml`,
  );
});

app.get("/sitemap.xml", async (c) => {
  // Top 5,000 skills by downloads. With 12+ days of data, charts are
  // meaningful enough to index. Skills below top 5k have <200 downloads
  // and less interesting charts — expand further as data matures.
  const { results } = await c.env.DB.prepare(
    `SELECT s.handle, s.slug FROM skills s
     JOIN snapshots sn ON sn.skill_id = s.id
     WHERE sn.captured_at = (SELECT MAX(captured_at) FROM snapshots)
     AND s.source = 'clawhub'
     ORDER BY sn.downloads DESC
     LIMIT 5000`,
  ).all<{ handle: string; slug: string }>();

  const urls = [
    `  <url><loc>https://skill-history.com/</loc></url>`,
    `  <url><loc>https://skill-history.com/faq</loc></url>`,
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

app.get("/llms.txt", (c) => {
  return c.text(`# skill-history.com

> Track and visualize ClawHub agent skill download history over time.
> Like star-history.com, but for agent skills.

skill-history.com records daily download snapshots for all 54,000+ skills
on ClawHub (clawhub.ai). Authors can embed a live-updating SVG chart or
compact badge in their GitHub README showing download growth over time.

Data collection started April 16, 2026. ClawHub does not provide historical
download data (only a current cumulative total), so charts begin from that
date. New snapshots are captured every 2 hours.

## Data available

- Daily download counts per skill (cumulative, from ClawHub)
- Daily installs_all_time per skill (cumulative)
- Historical snapshots going back to 2026-04-16

## API endpoints

All skill pages return JSON when requested with Accept: application/json.

### GET /{handle}/{slug}
Returns skill metadata and all daily snapshots.
Example: GET /gavinlinasd/self-preserve
Headers: Accept: application/json
Response: { skill: { handle, slug, display_name }, snapshots: [{ captured_at, downloads, installs_all_time }] }

### GET /chart/{handle}/{slug}.svg
Returns an SVG line chart of download history over time.
Embeddable in GitHub READMEs and web pages.
Supports dark mode via prefers-color-scheme media query.
Headers: Content-Type: image/svg+xml, Access-Control-Allow-Origin: *

### GET /badge/{handle}/{slug}.svg
Returns a compact shields.io-style badge showing current download count.
Embeddable inline in READMEs.
Headers: Content-Type: image/svg+xml, Access-Control-Allow-Origin: *

### GET /api/openapi.json
Full OpenAPI 3.0.3 specification for all endpoints.

### GET /faq
Frequently asked questions about data coverage, how it works, and
how it differs from star-history.com.

## URL mapping
- ClawHub: clawhub.ai/{handle}/{slug}
- skill-history: skill-history.com/{handle}/{slug}
- GitHub: github.com/{handle}/{slug} (when repo exists; handle = GitHub username via OAuth)

## Embedding

Markdown for README chart embed:
[![Download history](https://skill-history.com/chart/{handle}/{slug}.svg)](https://skill-history.com/{handle}/{slug})

Markdown for compact badge:
[![Downloads](https://skill-history.com/badge/{handle}/{slug}.svg)](https://skill-history.com/{handle}/{slug})

## MCP Server

skill-history.com provides an MCP (Model Context Protocol) server for AI agents
to query skill download data directly.

Endpoint: https://skill-history.com/mcp
Transport: Streamable HTTP (stateless, no auth required)

### Setup

Claude Code:
  claude mcp add --transport http skill-history https://skill-history.com/mcp

Cursor / other MCP clients:
  { "mcpServers": { "skill-history": { "url": "https://skill-history.com/mcp" } } }

### Available tools

1. get_skill_downloads(handle, slug)
   Returns skill metadata and all daily download snapshots.
   Example: get_skill_downloads("gavinlinasd", "self-preserve")
   Response: { skill: { handle, slug, display_name }, snapshots: [{ captured_at, downloads, installs_all_time }] }

2. search_skills(query, limit?)
   Search skills by name, slug, or author handle. Returns top results by downloads.
   Example: search_skills("browser", 5)
   Response: { query, results: [{ handle, slug, display_name, source, downloads }] }

### Search API

GET /api/search?q={query}&limit=10
Same search as the MCP tool, available as a REST endpoint.
Minimum 2 characters. Max 50 results. Cached 60s.

## About
Built by Pineapple AI (https://pineappleai.com)
Source: https://github.com/pineapple-farm/skill-history
Blog: https://gavinpineapple.substack.com`);
});

app.get("/api/openapi.json", (c) => {
  const spec = {
    openapi: "3.0.3",
    info: {
      title: "skill-history.com API",
      description:
        "Track and visualize ClawHub agent skill download history over time.",
      version: "1.0.0",
      contact: {
        name: "Pineapple AI",
        url: "https://pineappleai.com",
      },
    },
    servers: [{ url: "https://skill-history.com" }],
    paths: {
      "/{handle}/{slug}": {
        get: {
          summary: "Get skill metadata and download snapshots",
          description:
            "Returns skill metadata and all daily download snapshots. Send Accept: application/json to receive JSON.",
          parameters: [
            {
              name: "handle",
              in: "path" as const,
              required: true,
              schema: { type: "string" },
              description: "ClawHub user handle",
              example: "gavinlinasd",
            },
            {
              name: "slug",
              in: "path" as const,
              required: true,
              schema: { type: "string" },
              description: "Skill slug",
              example: "self-preserve",
            },
          ],
          responses: {
            "200": {
              description: "Skill data with snapshots",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      skill: {
                        type: "object",
                        properties: {
                          id: { type: "integer" },
                          handle: { type: "string" },
                          slug: { type: "string" },
                          display_name: {
                            type: "string",
                            nullable: true,
                          },
                        },
                        required: ["id", "handle", "slug"],
                      },
                      snapshots: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            captured_at: {
                              type: "string",
                              format: "date",
                              example: "2026-04-16",
                            },
                            downloads: { type: "integer" },
                            installs_all_time: { type: "integer" },
                          },
                          required: [
                            "captured_at",
                            "downloads",
                            "installs_all_time",
                          ],
                        },
                      },
                    },
                    required: ["skill", "snapshots"],
                  },
                },
              },
            },
            "404": {
              description: "Skill not tracked",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      handle: { type: "string" },
                      slug: { type: "string" },
                    },
                    required: ["error", "handle", "slug"],
                  },
                },
              },
            },
          },
        },
      },
      "/chart/{handle}/{slug}.svg": {
        get: {
          summary: "Get download history chart as SVG",
          description:
            "Returns an SVG chart image of download history. Embeddable in GitHub READMEs and web pages.",
          parameters: [
            {
              name: "handle",
              in: "path" as const,
              required: true,
              schema: { type: "string" },
              description: "ClawHub user handle",
            },
            {
              name: "slug",
              in: "path" as const,
              required: true,
              schema: { type: "string" },
              description: "Skill slug (without .svg extension)",
            },
          ],
          responses: {
            "200": {
              description: "SVG chart image",
              content: {
                "image/svg+xml": {
                  schema: { type: "string", format: "binary" },
                },
              },
              headers: {
                "Access-Control-Allow-Origin": {
                  schema: { type: "string", example: "*" },
                },
              },
            },
            "404": {
              description: "Skill not found (returns a not-found SVG)",
              content: {
                "image/svg+xml": {
                  schema: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
      },
    },
  };
  return c.json(spec);
});

app.get("/api/search", async (c) => {
  const query = c.req.query("q") || "";
  const limit = Math.min(parseInt(c.req.query("limit") || "10"), 50);

  if (query.length < 2) {
    return c.json({ query, results: [] });
  }

  const pattern = `%${query}%`;
  const { results } = await c.env.DB.prepare(
    `SELECT s.handle, s.slug, s.display_name, s.source,
            (SELECT sn.downloads FROM snapshots sn WHERE sn.skill_id = s.id ORDER BY sn.captured_at DESC LIMIT 1) as downloads
     FROM skills s
     WHERE s.handle LIKE ? OR s.slug LIKE ? OR s.display_name LIKE ?
     ORDER BY downloads DESC
     LIMIT ?`
  ).bind(pattern, pattern, pattern, limit)
   .all<{ handle: string; slug: string; display_name: string | null; source: string; downloads: number | null }>();

  return c.json({ query, results: results ?? [] }, 200, {
    "Cache-Control": "public, max-age=60, s-maxage=60",
  });
});

app.all("/mcp", async (c) => {
  const server = createMcpHandler(c.env.DB);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });
  await server.connect(transport);
  const response = await transport.handleRequest(c.req.raw);
  return response;
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
  "Cache-Control": "public, max-age=300, s-maxage=300",
  "Access-Control-Allow-Origin": "*",
};

app.get("/badge/:handle/:slugSvg", async (c) => {
  const handle = c.req.param("handle");
  const slugSvg = c.req.param("slugSvg");
  if (!slugSvg.endsWith(".svg")) {
    return c.notFound();
  }
  const slug = slugSvg.slice(0, -4);

  const row = await c.env.DB.prepare(
    `SELECT sn.downloads FROM skills s JOIN snapshots sn ON sn.skill_id = s.id
     WHERE s.handle = ? AND s.slug = ? ORDER BY sn.captured_at DESC LIMIT 1`,
  )
    .bind(handle, slug)
    .first<{ downloads: number }>();

  const count = row ? fmtNum(row.downloads) : "unknown";

  const label = "downloads";
  const labelWidth = 70;
  const countWidth = label === "downloads" ? Math.max(45, count.length * 7 + 10) : 50;
  const totalWidth = labelWidth + countWidth;

  const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${count}">
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${countWidth}" height="20" fill="#f97316"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + countWidth / 2}" y="14">${count}</text>
  </g>
</svg>`;

  return new Response(badge, { status: row ? 200 : 404, headers: SVG_HEADERS });
});

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

app.get("/og/:handle/:slugPng", async (c) => {
  const handle = c.req.param("handle");
  const slugPng = c.req.param("slugPng");
  if (!slugPng.endsWith(".png")) return c.notFound();
  const slug = slugPng.slice(0, -4);

  const STONKS_FALLBACK = "https://raw.githubusercontent.com/pineapple-farm/skill-history/main/public/og-image.jpg";

  try {
    // Check CF cache first
    const cacheKey = new Request(`https://skill-history.com/og/${handle}/${slug}.png`);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const data = await loadSkillAndSnapshots(c.env.DB, handle, slug);
    if (!data) {
      // Return the default stonks meme for unknown skills
      return c.redirect(STONKS_FALLBACK);
    }

    const svgContent = data.snapshots.length === 0
      ? renderEmptySvg(data.skill)
      : renderChartSvg(data.skill, data.snapshots);

    const html = `<!DOCTYPE html><html><head><style>body{margin:0;padding:0;}</style></head><body>${svgContent}</body></html>`;

    const browser = await puppeteer.launch(c.env.BROWSER);
    const page = await browser.newPage();
    await page.setViewport({ width: 600, height: 300 });
    await page.setContent(html, { waitUntil: "networkidle0" });
    const png = await page.screenshot({ type: "png" });
    await browser.close();

    const response = new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });

    // Store in CF cache
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  } catch (err) {
    console.error(`[og] error generating OG image for ${handle}/${slug}`, err);
    return c.redirect(STONKS_FALLBACK);
  }
});

app.get("/:handle/:slug", async (c) => {
  const { handle, slug } = c.req.param();

  try {
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

    // Check GitHub existence from cache first
    let hasGithubPromise: Promise<boolean>;
    const cachedGithub = getCachedGithubExists(handle, slug);
    if (cachedGithub !== null) {
      hasGithubPromise = Promise.resolve(cachedGithub);
    } else {
      hasGithubPromise = fetch(`https://github.com/${handle}/${slug}`, { method: "HEAD", redirect: "follow" })
        .then((r) => {
          const exists = r.status === 200;
          setCachedGithubExists(handle, slug, exists);
          return exists;
        })
        .catch(() => {
          setCachedGithubExists(handle, slug, false);
          return false;
        });
    }

    // Fire both in parallel — neither blocks the other
    const [moreByAuthorRows, hasGithub] = await Promise.all([
      c.env.DB.prepare(
        `SELECT s.slug, s.display_name, sn.downloads
         FROM skills s JOIN snapshots sn ON sn.skill_id = s.id
         WHERE s.handle = ? AND s.slug != ?
         AND sn.captured_at = (SELECT MAX(captured_at) FROM snapshots)
         ORDER BY sn.downloads DESC LIMIT 3`,
      )
        .bind(handle, slug)
        .all<{ slug: string; display_name: string | null; downloads: number }>(),
      hasGithubPromise,
    ]);
    const moreByAuthor = moreByAuthorRows.results ?? [];
    const url = new URL(c.req.url);
    const origin = `${url.protocol}//${url.host}`;
    return c.html(renderChartPageHtml(data.skill, data.snapshots, origin, moreByAuthor, hasGithub));
  } catch (err) {
    console.error(`[skill-page] error for ${handle}/${slug}`, err);
    return c.html(
      `<!DOCTYPE html><meta charset="utf-8"><title>Error — skill-history.com</title><body style="font-family:system-ui;max-width:640px;margin:40px auto;padding:0 16px"><h1>Something went wrong</h1><p>Try again later.</p></body>`,
      500,
    );
  }
});

export default {
  fetch: app.fetch,

  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    // Two crons: "0 */2 * * *" (even hours) for ClawHub,
    // "0 1-23/2 * * *" (odd hours) for skills.sh.
    // Determine which by checking the scheduled time.
    const scheduledHour = new Date(controller.scheduledTime).getUTCHours();
    if (scheduledHour % 2 === 0) {
      const result = await runSweep(env.DB);
      console.log("clawhub sweep complete", result);
    } else {
      const result = await runSkillsshSweep(env.DB);
      console.log("skillssh sweep complete", result);
    }
  },
} satisfies ExportedHandler<Env>;
