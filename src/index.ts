import { Hono } from "hono";
import { runSweep } from "./sweep";
import {
  renderChartPageHtml,
  renderChartSvg,
  renderEmptySvg,
  renderNotFoundSvg,
  fmtNum,
  type Snapshot,
  type SkillMeta,
} from "./chart";

type Env = {
  DB: D1Database;
};

const GA_TAG = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-06QZRBETMR"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-06QZRBETMR');</script>`;

const app = new Hono<{ Bindings: Env }>();

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

  // Trending: highest % growth over last 7 days, floor 100 downloads
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
     LEFT JOIN snapshots older ON older.skill_id = s.id
       AND older.captured_at = (SELECT MAX(captured_at) FROM snapshots WHERE captured_at <= date((SELECT MAX(captured_at) FROM snapshots), '-7 days'))
     WHERE latest.downloads >= 100
       AND older.downloads IS NOT NULL
       AND older.downloads > 0
     ORDER BY growth_pct DESC
     LIMIT 2`,
  ).all<{ handle: string; slug: string; display_name: string | null; growth_pct: number }>();

  const trendingCards = (trending.results ?? [])
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
${GA_TAG}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23f97316'/><polyline points='6,22 12,18 18,14 26,8' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/></svg>">
<title>ClawHub Download Analytics — skill-history.com</title>
<meta name="description" content="Like star-history, but for ClawHub downloads. Free download tracking and charts for all 54,000+ ClawHub skills. Embed a badge or history chart in your README in seconds.">
<link rel="canonical" href="https://skill-history.com/">
<meta property="og:type" content="website">
<meta property="og:title" content="ClawHub Download Analytics — skill-history.com">
<meta property="og:description" content="Like star-history, but for ClawHub downloads. Free download tracking and charts for all 54,000+ ClawHub skills. Embed a badge or history chart in your README in seconds.">
<meta property="og:url" content="https://skill-history.com/">
<meta name="twitter:card" content="summary">
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
  <h1>Download analytics for every ClawHub skill</h1>
  <p class="tagline">Like star-history, but for ClawHub downloads. Track 54,000+ skills — free, no signup, no tokens.</p>
  <p style="color:#9ca3af;font-size:13px;margin:4px 0 0;">Starting with ClawHub. More skill registries coming.</p>
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
  <h2>Featured Skills</h2>
  ${featuredCards}
</section>

${trendingCards ? `<section>
  <h2>Trending on ClawHub</h2>
  ${trendingCards}
</section>` : ""}

<section>
  <h2>FAQ</h2>
  <h3>Why does data only start from April 2026?</h3>
  <p>ClawHub doesn&rsquo;t provide historical download data &mdash; only a current cumulative total. Unlike GitHub stars (which have timestamps, letting star-history reconstruct a full history), ClawHub downloads are a single counter with no event log. We started recording daily snapshots on April 16, 2026. The longer we run, the richer the charts get.</p>
  <h3>How is this different from star-history.com?</h3>
  <p>Star-history tracks GitHub stars, which have timestamps &mdash; so they can reconstruct a full history back to day one. ClawHub downloads don&rsquo;t have timestamps, so we can only track from the day we started polling. Think of it as: star-history looks backward, skill-history looks forward.</p>
  <h3>Will my chart keep updating?</h3>
  <p>Yes. We poll every skill on ClawHub multiple times per day and store a daily snapshot. Your chart updates automatically &mdash; no setup, no tokens, no maintenance on your end.</p>
  <h3>My skill isn&rsquo;t showing up?</h3>
  <p>We track all 54,000+ skills on ClawHub. If your skill was recently published, it should appear within a few hours. If it still doesn&rsquo;t show, <a href="https://github.com/pineapple-farm/skill-history/issues/new">open an issue</a>.</p>
  <h3>Will you track skills from other registries?</h3>
  <p>Yes &mdash; skill-history is built to be registry-agnostic. ClawHub is the starting point since it&rsquo;s where the agent skill ecosystem is most concentrated today. Support for additional registries is on the roadmap.</p>
</section>

<footer>
  Built by <a href="https://pineappleai.com">Pineapple AI</a> &middot; <a href="/faq">FAQ</a> &middot; <a href="https://gavinpineapple.substack.com/p/building-a-zero-human-company-for">Blog</a> &middot; <a href="https://github.com/pineapple-farm/skill-history">Source</a> &middot; <a href="https://clawhub.ai">ClawHub</a>
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
  <a href="/">Home</a> &middot; Built by <a href="https://pineappleai.com">Pineapple AI</a> &middot; <a href="/faq">FAQ</a> &middot; <a href="https://gavinpineapple.substack.com/p/building-a-zero-human-company-for">Blog</a> &middot; <a href="https://github.com/pineapple-farm/skill-history">Source</a> &middot; <a href="https://clawhub.ai">ClawHub</a>
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
  const moreByAuthorRows = await c.env.DB.prepare(
    `SELECT s.slug, s.display_name, sn.downloads
     FROM skills s JOIN snapshots sn ON sn.skill_id = s.id
     WHERE s.handle = ? AND s.slug != ?
     AND sn.captured_at = (SELECT MAX(captured_at) FROM snapshots)
     ORDER BY sn.downloads DESC LIMIT 3`,
  )
    .bind(handle, slug)
    .all<{ slug: string; display_name: string | null; downloads: number }>();
  const moreByAuthor = moreByAuthorRows.results ?? [];
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;
  return c.html(renderChartPageHtml(data.skill, data.snapshots, origin, moreByAuthor));
});

export default {
  fetch: app.fetch,

  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const result = await runSweep(env.DB);
    console.log("sweep complete", result);
  },
} satisfies ExportedHandler<Env>;
