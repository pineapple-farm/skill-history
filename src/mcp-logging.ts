// Per-call usage logging for the MCP endpoint.
//
// Cloudflare's /mcp route gets thousands of requests/week but we have no
// per-tool visibility. This module extracts the JSON-RPC method (and tool name
// for tools/call) from each request and records a data point in an Analytics
// Engine dataset, queryable via GraphQL for durable aggregation.
//
// Privacy: client IPs are SHA-256 hashed (truncated) before storage — no raw
// PII is ever written. All logging is best-effort and must never break or slow
// the MCP request (callers run it via ctx.waitUntil).

export type McpCallLog = {
  method: string;
  tool: string | null;
};

type JsonRpcMessage = {
  method?: unknown;
  params?: { name?: unknown } | null;
};

/**
 * Parse a JSON-RPC request body into the calls it represents. Handles both
 * single messages and batch arrays. Messages without a string `method`
 * (responses, malformed entries) are skipped.
 */
export function parseMcpCalls(body: unknown): McpCallLog[] {
  const messages = Array.isArray(body) ? body : [body];
  const calls: McpCallLog[] = [];
  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const msg = raw as JsonRpcMessage;
    if (typeof msg.method !== "string") continue;
    let tool: string | null = null;
    if (msg.method === "tools/call") {
      const name = msg.params?.name;
      if (typeof name === "string") tool = name;
    }
    calls.push({ method: msg.method, tool });
  }
  return calls;
}

/**
 * Hash a client IP to a short, non-reversible token so we can distinguish
 * distinct clients for coarse traffic analysis without storing PII. Returns
 * an empty string when no IP is available.
 */
export async function hashIp(ip: string | null | undefined): Promise<string> {
  if (!ip) return "";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ip),
  );
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 8; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

/**
 * Inspect a cloned MCP request and record one Analytics Engine data point per
 * JSON-RPC call. Best-effort: any error is swallowed so usage logging can
 * never break the actual MCP response. Intended to run inside ctx.waitUntil.
 */
export async function logMcpUsage(
  analytics: AnalyticsEngineDataset,
  request: Request,
  userAgent: string,
  ip: string | null | undefined,
): Promise<void> {
  try {
    const body = await request.json();
    const calls = parseMcpCalls(body);
    if (calls.length === 0) return;
    const ipHash = await hashIp(ip);
    const ua = userAgent.slice(0, 256);
    for (const call of calls) {
      analytics.writeDataPoint({
        // blob1=method, blob2=tool, blob3=user-agent, blob4=hashed client IP
        blobs: [call.method, call.tool ?? "", ua, ipHash],
        doubles: [1], // one call; sum for counts
        indexes: [call.tool ?? call.method], // sample/group key
      });
    }
  } catch {
    // Logging is best-effort; never surface failures to the MCP client.
  }
}
