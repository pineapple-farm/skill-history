import { line, curveMonotoneX, area } from "d3-shape";

export type Snapshot = {
  captured_at: string;
  downloads: number;
  installs_all_time: number;
};

export type SkillMeta = {
  handle: string;
  slug: string;
  display_name: string | null;
};

const W = 600;
const H = 300;
const PAD = { top: 28, right: 16, bottom: 44, left: 56 };
const CHART_W = W - PAD.left - PAD.right;
const CHART_H = H - PAD.top - PAD.bottom;
const LINE_COLOR = "#f97316";
const AXIS_COLOR = "#d1d5db";
const TEXT_COLOR = "#374151";
const MUTED_COLOR = "#6b7280";
const ATTRIBUTION = "skill-history.com · Pineapple AI";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toString();
}

function fmtAxisLabel(n: number, range: number): string {
  // When the range is small relative to the values, fmtNum produces
  // duplicate labels (e.g. all "2.4k"). Use higher precision instead.
  if (range < 500 && n >= 1_000) {
    // Full integers with comma separators: 2,386
    return Math.round(n).toLocaleString("en-US");
  }
  if (range < 5_000 && n >= 1_000_000) {
    // Two decimals for M: 1.23M
    return (n / 1_000_000).toFixed(2) + "M";
  }
  if (range < 5_000 && n >= 1_000) {
    // Two decimals for k: 2.39k
    return (n / 1_000).toFixed(2) + "k";
  }
  return fmtNum(n);
}

const DARK_MODE_STYLE = `<style>
  @media (prefers-color-scheme: dark) {
    .bg { fill: #0f172a; }
    .text-primary { fill: #e5e7eb; }
    .text-muted { fill: #9ca3af; }
    .grid { stroke: #334155; }
  }
</style>`;

function svgOpen(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">${DARK_MODE_STYLE}`;
}

function attributionText(): string {
  return `<text class="text-muted" x="${W - 8}" y="${H - 8}" text-anchor="end" font-size="10" fill="${MUTED_COLOR}">${ATTRIBUTION}</text>`;
}

export function renderEmptySvg(skill: SkillMeta): string {
  const title = escapeXml(skill.display_name ?? `${skill.handle}/${skill.slug}`);
  return `${svgOpen()}
  <rect class="bg" width="100%" height="100%" fill="white"/>
  <text class="text-primary" x="${W / 2}" y="${H / 2 - 6}" text-anchor="middle" font-size="14" fill="${TEXT_COLOR}">${title}</text>
  <text class="text-muted" x="${W / 2}" y="${H / 2 + 14}" text-anchor="middle" font-size="12" fill="${MUTED_COLOR}">tracking starts on next sweep</text>
  ${attributionText()}
</svg>`;
}

export function renderNotFoundSvg(handle: string, slug: string): string {
  return `${svgOpen()}
  <rect class="bg" width="100%" height="100%" fill="white"/>
  <text class="text-primary" x="${W / 2}" y="${H / 2 - 6}" text-anchor="middle" font-size="14" fill="${TEXT_COLOR}">${escapeXml(handle)}/${escapeXml(slug)}</text>
  <text class="text-muted" x="${W / 2}" y="${H / 2 + 14}" text-anchor="middle" font-size="12" fill="${MUTED_COLOR}">skill not found on ClawHub</text>
  ${attributionText()}
</svg>`;
}

export function renderChartSvg(
  skill: SkillMeta,
  snapshots: Snapshot[],
): string {
  const n = snapshots.length;
  const downloads = snapshots.map((s) => s.downloads);
  const rawMin = Math.min(...downloads);
  const rawMax = Math.max(...downloads);

  // Scale y-axis to show variation. Compute nice bounds based on the
  // data range (not absolute values) so a 390k→392k spread doesn't
  // get rounded to 300k–500k.
  const range = rawMax - rawMin;
  const { yMin, yMax } = niceAxis(rawMin, rawMax, range);

  const xAt = (i: number) =>
    PAD.left + (n === 1 ? CHART_W / 2 : (i / (n - 1)) * CHART_W);
  const yAt = (v: number) =>
    PAD.top + CHART_H - ((v - yMin) / (yMax - yMin)) * CHART_H;

  const coords = snapshots.map((s, i) => ({
    x: xAt(i),
    y: yAt(s.downloads),
  }));
  const points = coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const firstDate = snapshots[0].captured_at;
  const lastDate = snapshots[n - 1].captured_at;
  const title = escapeXml(skill.display_name ?? `${skill.handle}/${skill.slug}`);
  const lastDownloads = snapshots[n - 1].downloads;

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const y = PAD.top + CHART_H - f * CHART_H;
      const label = fmtAxisLabel(Math.round(yMin + (yMax - yMin) * f), yMax - yMin);
      return `<line class="grid" x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="${AXIS_COLOR}" stroke-width="1" stroke-dasharray="${f === 0 ? "0" : "2,2"}"/><text class="text-muted" x="${PAD.left - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="${MUTED_COLOR}">${label}</text>`;
    })
    .join("");

  // d3-shape: smooth monotone curve (same algorithm star-history uses)
  const curvePath =
    n >= 2
      ? (line<{ x: number; y: number }>()
          .x((d) => d.x)
          .y((d) => d.y)
          .curve(curveMonotoneX)(coords) ?? "")
      : "";

  // Gradient fill under the curve
  const areaPath =
    n >= 2
      ? (area<{ x: number; y: number }>()
          .x((d) => d.x)
          .y0(PAD.top + CHART_H)
          .y1((d) => d.y)
          .curve(curveMonotoneX)(coords) ?? "")
      : "";

  const smoothLine =
    n >= 2
      ? `<path d="${areaPath}" fill="url(#grad)" /><path d="${curvePath}" fill="none" stroke="${LINE_COLOR}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
      : "";
  const dotRadius = n === 1 ? 4 : 2.5;
  const dots = coords
    .map(
      (p) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${dotRadius}" fill="${LINE_COLOR}"/>`,
    )
    .join("");

  const gradient = `<defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${LINE_COLOR}" stop-opacity="0.15"/><stop offset="100%" stop-color="${LINE_COLOR}" stop-opacity="0.01"/></linearGradient></defs>`;

  return `${svgOpen()}
  ${gradient}
  <rect class="bg" width="100%" height="100%" fill="white"/>
  <text class="text-primary" x="${PAD.left}" y="16" font-size="12" fill="${TEXT_COLOR}" font-weight="600">${title}</text>
  <text class="text-muted" x="${W - PAD.right}" y="16" text-anchor="end" font-size="12" fill="${MUTED_COLOR}">${fmtNum(lastDownloads)} ClawHub downloads</text>
  ${gridLines}
  ${smoothLine}
  ${dots}
  <text class="text-muted" x="${PAD.left}" y="${H - 16}" font-size="10" fill="${MUTED_COLOR}">${firstDate}</text>
  <text class="text-muted" x="${W - PAD.right}" y="${H - 16}" text-anchor="end" font-size="10" fill="${MUTED_COLOR}">${lastDate}</text>
  ${attributionText()}
</svg>`;
}

function niceAxis(
  rawMin: number,
  rawMax: number,
  range: number,
): { yMin: number; yMax: number } {
  if (range === 0) {
    // All values identical — show a band around the value
    const pad = Math.max(1, rawMin * 0.05);
    return { yMin: Math.max(0, rawMin - pad), yMax: rawMax + pad };
  }
  // Axis should be tight around the data: pad by 20% of the change
  // so the line fills the chart. Works for delta=8 and delta=1615 alike.
  const pad = range * 0.2;
  return { yMin: Math.max(0, rawMin - pad), yMax: rawMax + pad };
}

export function renderChartPageHtml(
  skill: SkillMeta,
  snapshots: Snapshot[],
  origin: string,
  moreByAuthor?: Array<{slug: string, display_name: string | null, downloads: number}>,
  hasGithub?: boolean,
): string {
  const title = escapeXml(skill.display_name ?? `${skill.handle}/${skill.slug}`);
  const CANONICAL_ORIGIN = "https://skill-history.com";
  const svgUrl = `${CANONICAL_ORIGIN}/chart/${skill.handle}/${skill.slug}.svg`;
  const pageUrl = `${CANONICAL_ORIGIN}/${skill.handle}/${skill.slug}`;
  const clawhubUrl = `https://clawhub.ai/${skill.handle}/${skill.slug}`;
  const badgeUrl = `${CANONICAL_ORIGIN}/badge/${skill.handle}/${skill.slug}.svg`;
  const embedMarkdown = `[![Download history](${svgUrl})](${pageUrl})`;
  const embedEscaped = escapeXml(embedMarkdown);
  const badgeMarkdown = `[![Downloads](${badgeUrl})](${pageUrl})`;
  const badgeEscaped = escapeXml(badgeMarkdown);
  const latest = snapshots.at(-1);
  const delta = computeDeltas(snapshots);

  const headline = latest
    ? `${latest.downloads.toLocaleString()} ClawHub downloads`
    : "No snapshots yet";
  const subline = latest
    ? `${delta.d7 >= 0 ? "+" : ""}${delta.d7.toLocaleString()} last 7d · ${delta.d30 >= 0 ? "+" : ""}${delta.d30.toLocaleString()} last 30d · tracking since ${snapshots[0].captured_at}`
    : `Tracking starts on next sweep.`;

  const GA_TAG = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-06QZRBETMR"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-06QZRBETMR');</script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
${GA_TAG}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23f97316'/><polyline points='6,22 12,18 18,14 26,8' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/></svg>">
<title>${skill.slug} downloads — ClawHub skill stats | skill-history.com</title>
<meta name="description" content="Download history and stats for the ${skill.slug} ClawHub skill by ${skill.handle}. ${latest ? latest.downloads.toLocaleString() : '0'} total downloads, ${delta.d7 >= 0 ? '+' : ''}${delta.d7.toLocaleString()} in the last 7 days. Free embeddable chart and badge.">
<link rel="canonical" href="https://skill-history.com/${skill.handle}/${skill.slug}">
<meta property="og:type" content="website">
<meta property="og:title" content="${skill.slug} downloads — ClawHub skill stats | skill-history.com">
<meta property="og:description" content="Download history and stats for the ${skill.slug} ClawHub skill by ${skill.handle}. ${latest ? latest.downloads.toLocaleString() : '0'} total downloads, ${delta.d7 >= 0 ? '+' : ''}${delta.d7.toLocaleString()} in the last 7 days. Free embeddable chart and badge.">
<meta property="og:url" content="https://skill-history.com/${skill.handle}/${skill.slug}">
<meta property="og:image" content="https://skill-history.com/og/${skill.handle}/${skill.slug}.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "${title}",
  "author": { "@type": "Person", "name": "${skill.handle}" },
  "url": "${clawhubUrl}",
  "applicationCategory": "AI Agent Skill"
}
</script>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #111827; line-height: 1.5; }
  header { margin-bottom: 24px; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  .meta { color: #6b7280; font-size: 14px; }
  .meta a { color: #6b7280; }
  .stats { margin: 16px 0; }
  .headline { font-size: 20px; font-weight: 600; }
  .subline { color: #6b7280; font-size: 14px; margin-top: 2px; }
  .chart { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: white; margin: 24px 0; }
  .chart img { display: block; width: 100%; height: auto; }
  h2 { font-size: 16px; margin: 32px 0 8px; }
  pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 13px; }
  footer a { color: #6b7280; }
  .embed-row { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
  .embed-option { flex: 1; min-width: 280px; }
  .embed-label { font-size: 13px; font-weight: 600; color: #6b7280; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
  .embed-code { font-size: 11px; padding: 8px; margin: 0; border-radius: 4px; word-break: break-all; line-height: 1.3; white-space: pre-wrap; }
  .btn-embed { font-size: 11px; padding: 2px 8px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; color: #374151; cursor: pointer; font-family: inherit; }
  .btn-embed:hover { background: #f9fafb; border-color: #9ca3af; }
  .share-row { display: flex; gap: 8px; margin: 16px 0; }
  .btn-action { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; padding: 6px 14px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; color: #374151; text-decoration: none; font-family: inherit; cursor: pointer; }
  .btn-action:hover { background: #f9fafb; border-color: #9ca3af; }
  @media (prefers-color-scheme: dark) {
    body { color: #e5e7eb; background: #0f172a; }
    .meta, .subline, footer, footer a, .meta a { color: #9ca3af; }
    pre { background: #1e293b; }
    .chart { border-color: #334155; background: white; }
    .btn-embed { background: #1e293b; color: #e5e7eb; border-color: #475569; }
    .btn-embed:hover { background: #334155; border-color: #64748b; }
    .embed-label { color: #9ca3af; }
    .btn-action { background: #1e293b; color: #e5e7eb; border-color: #475569; }
    .btn-action:hover { background: #334155; border-color: #64748b; }
  }
</style>
</head>
<body>
<nav style="margin-bottom:16px;font-size:13px;"><a href="/" style="color:#6b7280;text-decoration:none;">&larr; skill-history.com</a></nav>
<header>
  <h1>Download history for ${title}</h1>
  <div class="meta"><a href="${clawhubUrl}">${skill.handle}/${skill.slug}</a> on ClawHub 🦞${hasGithub ? ` · <a href="https://github.com/${skill.handle}/${skill.slug}">GitHub</a> <svg style="vertical-align:-2px;display:inline" width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>` : ""}</div>
</header>
<section class="stats">
  <div class="headline">${headline}</div>
  <div class="subline">${subline}</div>
</section>
<div class="chart"><img src="${svgUrl}" alt="ClawHub download history chart for ${skill.slug} by ${skill.handle}"></div>
<div class="embed-row">
  <div class="embed-option">
    <div class="embed-label">Chart embed <button id="copy-chart-btn" class="btn-embed" onclick="copyChart()">Copy</button></div>
    <pre class="embed-code">${embedEscaped}</pre>
  </div>
  <div class="embed-option">
    <div class="embed-label">Badge embed <button id="copy-badge-btn" class="btn-embed" onclick="copyBadge()">Copy</button> <img src="${badgeUrl}" alt="badge" style="vertical-align:-3px;margin-left:4px;height:16px;"></div>
    <pre class="embed-code">${badgeEscaped}</pre>
  </div>
</div>
<div class="share-row">
  <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(`${skill.display_name ?? `${skill.handle}/${skill.slug}`} has ${latest ? latest.downloads.toLocaleString() : "0"} ClawHub downloads and growing 📈`)}&url=${encodeURIComponent(`${CANONICAL_ORIGIN}/${skill.handle}/${skill.slug}`)}" target="_blank" rel="noopener" class="btn-action">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> Share
  </a>
  <a href="/og/${skill.handle}/${skill.slug}.png" download="${skill.slug}-downloads.png" target="_blank" class="btn-action">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> PNG
  </a>
</div>
${moreByAuthor && moreByAuthor.length > 0 ? `<h2>More by ${escapeXml(skill.handle)}</h2>
<ul style="list-style:none;padding:0;margin:0;">
${moreByAuthor.map(s => `  <li style="margin:6px 0;"><a href="/${escapeXml(skill.handle)}/${escapeXml(s.slug)}" style="color:#f97316;text-decoration:none;">${escapeXml(s.display_name || s.slug)}</a> <span style="color:#6b7280;font-size:13px;">&mdash; ${fmtNum(s.downloads)} downloads</span></li>`).join("\n")}
</ul>` : ""}
<footer>
  Built by <a href="https://pineappleai.com">Pineapple AI</a> · <a href="/faq">FAQ</a> · <a href="https://gavinpineapple.substack.com/p/i-built-skill-historycom-the-missing">Blog</a> · <a href="https://github.com/pineapple-farm/skill-history">Source</a> · <a href="https://clawhub.ai">ClawHub</a>
</footer>
<script>
var chartText = ${JSON.stringify(embedMarkdown)};
var badgeText = ${JSON.stringify(badgeMarkdown)};
function copyChart() {
  navigator.clipboard.writeText(chartText).then(function() {
    var btn = document.getElementById("copy-chart-btn");
    var orig = btn.innerHTML;
    btn.textContent = "Copied!";
    setTimeout(function() { btn.innerHTML = orig; }, 2000);
  });
}
function copyBadge() {
  navigator.clipboard.writeText(badgeText).then(function() {
    var btn = document.getElementById("copy-badge-btn");
    var orig = btn.innerHTML;
    btn.textContent = "Copied!";
    setTimeout(function() { btn.innerHTML = orig; }, 2000);
  });
}
</script>
</body>
</html>`;
}

function computeDeltas(snapshots: Snapshot[]): { d7: number; d30: number } {
  if (snapshots.length < 2) return { d7: 0, d30: 0 };
  const latest = snapshots.at(-1)!;
  const pick = (daysBack: number) => {
    const idx = Math.max(0, snapshots.length - 1 - daysBack);
    return snapshots[idx].downloads;
  };
  return {
    d7: latest.downloads - pick(7),
    d30: latest.downloads - pick(30),
  };
}
