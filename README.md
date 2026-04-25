# skill-history

Track and visualize agent skill download history from [ClawHub](https://clawhub.ai). An embeddable chart for READMEs — [star-history](https://star-history.com), but for agent skills.

[skill-history.com](https://skill-history.com) · built by [Pineapple AI](https://pineappleai.com)

[![Download History](https://skill-history.com/chart/gavinlinasd/self-preserve.svg)](https://skill-history.com/gavinlinasd/self-preserve)

## How it works

skill-history.com tracks daily download counts for all 54,000+ skills on ClawHub. Every skill gets a chart page and an embeddable SVG:

- **Chart page** — `skill-history.com/{handle}/{slug}`
- **SVG embed** — `skill-history.com/chart/{handle}/{slug}.svg`
- **Compact badge** — `skill-history.com/badge/{handle}/{slug}.svg`

Your `{handle}` is your GitHub username (ClawHub uses GitHub OAuth), and `{slug}` is your skill's slug on ClawHub.

### Add to your README

```markdown
[![Download History](https://skill-history.com/chart/YOUR_HANDLE/YOUR_SLUG.svg)](https://skill-history.com/YOUR_HANDLE/YOUR_SLUG)
```

Or use the link generator at [skill-history.com](https://skill-history.com).

## Architecture

- **Cloudflare Workers + Hono** — serves the site, chart SVGs, and scheduled sweeps
- **Cloudflare D1 (SQLite)** — stores skills and daily snapshots
- **d3-shape** — smooth monotone curves (same algorithm as star-history)
- **Data source** — ClawHub public API, sweeps every 2 hours

## API

All skill pages return JSON when requested with `Accept: application/json`:

```bash
curl -H "Accept: application/json" https://skill-history.com/gavinlinasd/self-preserve
```

Full OpenAPI spec at [skill-history.com/api/openapi.json](https://skill-history.com/api/openapi.json).

For AI agents: [skill-history.com/llms.txt](https://skill-history.com/llms.txt).

## Local development

```bash
npm install

# Authenticate with Cloudflare
wrangler login

# Create D1 database, copy database_id into wrangler.jsonc
wrangler d1 create skill-history

# Apply schema to local dev DB
npm run db:migrate:local

# Run locally
npm run dev
```

## Roadmap

- [x] Daily download tracking for all ClawHub skills
- [x] Embeddable SVG chart + compact badge
- [x] Landing page with link generator
- [x] Agent discoverability (llms.txt, OpenAPI)
- [ ] Smooth d3-powered chart rendering (full axis upgrade)
- [ ] Multi-source tracking (GitHub stars, non-ClawHub installs)
- [ ] Comparison charts (overlay multiple skills)
- [ ] Weekly "fastest growing skills" reports
- [ ] MCP server for agent tool access

Have an idea? [Open an issue](https://github.com/pineapple-farm/skill-history/issues/new) or submit a PR — we'd love your input.

## Contributing

This is a brand new project and we're actively shaping it based on what skill authors actually want. Contributions welcome:

- **Feature requests** — [open an issue](https://github.com/pineapple-farm/skill-history/issues/new) describing what you'd like to see
- **Bug reports** — if a chart looks wrong or a skill is missing, let us know
- **Pull requests** — code, docs, or design improvements are all welcome
- **Data sources** — ideas for tracking skills beyond ClawHub (GitHub stars, other registries)

## License

MIT

## Download History

[![Download History](https://skill-history.com/chart/sopaco/money-never-sleep.svg)](https://skill-history.com/sopaco/money-never-sleep)
