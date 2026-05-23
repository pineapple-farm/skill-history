# MCP Usage Logging

Per-call usage telemetry for the `/mcp` endpoint. Gives per-tool visibility
(which JSON-RPC methods / tools agents actually call) that Cloudflare's
request-count analytics can't.

## How it works

- `src/mcp-logging.ts` parses each JSON-RPC request (single or batch) and writes
  one data point per call to the **`mcp_usage`** Analytics Engine dataset.
- Wired in the `/mcp` route in `src/index.ts` via `ctx.waitUntil` so it's
  non-blocking and never affects the MCP response.
- Binding: `MCP_ANALYTICS` (`analytics_engine_datasets` in `wrangler.jsonc`).

### Data point schema

| Field    | Meaning                                                  |
|----------|----------------------------------------------------------|
| `blob1`  | JSON-RPC method (`tools/call`, `tools/list`, `initialize`…) |
| `blob2`  | Tool name (for `tools/call`; empty otherwise)            |
| `blob3`  | User-Agent (truncated to 256 chars)                      |
| `blob4`  | SHA-256 hash of client IP, truncated (no raw PII stored) |
| `double1`| `1` per call — sum for counts                            |
| `index1` | Tool name (or method) — sampling/group key               |

## Querying

Analytics Engine is queryable via the GraphQL Analytics API or the SQL API.
Example SQL (last 7 days, calls per method):

```sql
SELECT blob1 AS method, blob2 AS tool, SUM(_sample_interval * double1) AS calls
FROM mcp_usage
WHERE timestamp > NOW() - INTERVAL '7' DAY
GROUP BY method, tool
ORDER BY calls DESC
```

Run via the [SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/):

```bash
curl "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/analytics_engine/sql" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -d "SELECT blob1 AS method, blob2 AS tool, SUM(_sample_interval * double1) AS calls
      FROM mcp_usage WHERE timestamp > NOW() - INTERVAL '7' DAY
      GROUP BY method, tool ORDER BY calls DESC"
```

> Note: Analytics Engine `writeDataPoint` is a no-op in local `wrangler dev`;
> data only lands once deployed.
