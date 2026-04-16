# skill-history

Track and visualize agent skill download history from ClawHub. An embeddable chart for READMEs — star-history, but for agent skills.

[skill-history.com](https://skill-history.com) · built by [Pineapple AI](https://gavinpineapple.substack.com)

## Status

V1 in development. See [PRD on Notion](https://www.notion.so/skill-history-com-PRD-344c19d3c0dc8194ac55c141945aebac).

## Architecture

- **Cloudflare Workers + Hono** — HTTP + scheduled sweep
- **Cloudflare D1 (SQLite)** — skills + daily snapshots
- **Data source** — ClawHub Convex backend (`wry-manatee-359.convex.cloud`), queried directly via `listPublicPageV4`

Sweep runs every 6h, paginates the full catalog (~54k skills at ~200 items/page, ~2.4 min wall time), upserts skills and writes one snapshot per skill per UTC day.

## Local setup

```bash
npm install

# One-time: authenticate with Cloudflare
wrangler login

# One-time: create the D1 database, copy the database_id into wrangler.jsonc
wrangler d1 create skill-history

# Apply schema to local dev DB
npm run db:migrate:local

# Run locally
npm run dev
# Trigger a sweep manually: curl -X POST http://localhost:8787/admin/sweep
```

## Deploy

```bash
# Apply schema to production DB
npm run db:migrate:remote

# Deploy Worker + cron
npm run deploy
```

## License

MIT
