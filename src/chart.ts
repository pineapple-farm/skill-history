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
const H = 200;
const PAD = { top: 24, right: 16, bottom: 40, left: 56 };
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

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toString();
}

function svgOpen(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">`;
}

function attributionText(): string {
  return `<text x="${W - 8}" y="${H - 8}" text-anchor="end" font-size="10" fill="${MUTED_COLOR}">${ATTRIBUTION}</text>`;
}

export function renderEmptySvg(skill: SkillMeta): string {
  const title = escapeXml(skill.display_name ?? `${skill.handle}/${skill.slug}`);
  return `${svgOpen()}
  <rect width="100%" height="100%" fill="white"/>
  <text x="${W / 2}" y="${H / 2 - 6}" text-anchor="middle" font-size="14" fill="${TEXT_COLOR}">${title}</text>
  <text x="${W / 2}" y="${H / 2 + 14}" text-anchor="middle" font-size="12" fill="${MUTED_COLOR}">tracking starts on next sweep</text>
  ${attributionText()}
</svg>`;
}

export function renderNotFoundSvg(handle: string, slug: string): string {
  return `${svgOpen()}
  <rect width="100%" height="100%" fill="white"/>
  <text x="${W / 2}" y="${H / 2 - 6}" text-anchor="middle" font-size="14" fill="${TEXT_COLOR}">${escapeXml(handle)}/${escapeXml(slug)}</text>
  <text x="${W / 2}" y="${H / 2 + 14}" text-anchor="middle" font-size="12" fill="${MUTED_COLOR}">skill not found on ClawHub</text>
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
      const label = fmtNum(Math.round(yMin + (yMax - yMin) * f));
      return `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="${AXIS_COLOR}" stroke-width="1" stroke-dasharray="${f === 0 ? "0" : "2,2"}"/><text x="${PAD.left - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="${MUTED_COLOR}">${label}</text>`;
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
  <rect width="100%" height="100%" fill="white"/>
  <text x="${PAD.left}" y="16" font-size="12" fill="${TEXT_COLOR}" font-weight="600">${title}</text>
  <text x="${W - PAD.right}" y="16" text-anchor="end" font-size="12" fill="${MUTED_COLOR}">${fmtNum(lastDownloads)} ClawHub downloads</text>
  ${gridLines}
  ${smoothLine}
  ${dots}
  <text x="${PAD.left}" y="${H - 16}" font-size="10" fill="${MUTED_COLOR}">${firstDate}</text>
  <text x="${W - PAD.right}" y="${H - 16}" text-anchor="end" font-size="10" fill="${MUTED_COLOR}">${lastDate}</text>
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
): string {
  const title = escapeXml(skill.display_name ?? `${skill.handle}/${skill.slug}`);
  const svgUrl = `${origin}/chart/${skill.handle}/${skill.slug}.svg`;
  const pageUrl = `${origin}/${skill.handle}/${skill.slug}`;
  const clawhubUrl = `https://clawhub.ai/${skill.handle}/${skill.slug}`;
  const embedMarkdown = `[![Download history](${svgUrl})](${pageUrl})`;
  const embedEscaped = escapeXml(embedMarkdown);
  const latest = snapshots.at(-1);
  const delta = computeDeltas(snapshots);

  const headline = latest
    ? `${latest.downloads.toLocaleString()} ClawHub downloads`
    : "No snapshots yet";
  const subline = latest
    ? `${delta.d7 >= 0 ? "+" : ""}${delta.d7.toLocaleString()} last 7d · ${delta.d30 >= 0 ? "+" : ""}${delta.d30.toLocaleString()} last 30d · tracking since ${snapshots[0].captured_at}`
    : `Tracking starts on next sweep.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — skill-history.com</title>
<meta name="description" content="Download history for ClawHub skill ${skill.handle}/${skill.slug}">
<link rel="canonical" href="https://skill-history.com/${skill.handle}/${skill.slug}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title} — skill-history.com">
<meta property="og:description" content="Download history for ${skill.handle}/${skill.slug} on ClawHub">
<meta property="og:url" content="https://skill-history.com/${skill.handle}/${skill.slug}">
<meta property="og:image" content="https://skill-history.com/chart/${skill.handle}/${skill.slug}.svg">
<meta name="twitter:card" content="summary_large_image">
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
  .embed-section { position: relative; }
  .embed-actions { display: flex; gap: 8px; margin-bottom: 8px; }
  .btn-small { font-size: 13px; padding: 4px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; color: #374151; cursor: pointer; font-family: inherit; line-height: 1.4; }
  .btn-small:hover { background: #f9fafb; border-color: #9ca3af; }
  @media (prefers-color-scheme: dark) {
    body { color: #e5e7eb; background: #0f172a; }
    .meta, .subline, footer, footer a, .meta a { color: #9ca3af; }
    pre { background: #1e293b; }
    .chart { border-color: #334155; background: white; }
    .btn-small { background: #1e293b; color: #e5e7eb; border-color: #475569; }
    .btn-small:hover { background: #334155; border-color: #64748b; }
  }
</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <div class="meta"><a href="${clawhubUrl}">${skill.handle}/${skill.slug}</a> on ClawHub</div>
</header>
<section class="stats">
  <div class="headline">${headline}</div>
  <div class="subline">${subline}</div>
</section>
<div class="chart"><img src="${svgUrl}" alt="Download history for ${title}"></div>
<h2>Embed this chart</h2>
<div class="embed-section">
  <div class="embed-actions">
    <button id="copy-btn" class="btn-small" onclick="copyEmbed()">Copy</button>
  </div>
  <pre id="embed-code">${embedEscaped}</pre>
  <p style="color:#6b7280;font-size:13px;margin-top:8px;">Paste this into your README to show a live download chart.</p>
</div>
<footer>
  Built by <a href="https://pineappleai.com">Pineapple AI</a> · <a href="https://github.com/pineapple-farm/skill-history">source</a>
</footer>
<script>
var embedText = ${JSON.stringify(embedMarkdown)};
function copyEmbed() {
  navigator.clipboard.writeText(embedText).then(function() {
    var btn = document.getElementById("copy-btn");
    btn.textContent = "Copied!";
    setTimeout(function() { btn.textContent = "Copy"; }, 2000);
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
