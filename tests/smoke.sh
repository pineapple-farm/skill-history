#!/bin/bash
# Smoke tests for skill-history.com
# Run: bash tests/smoke.sh

PASS=0
FAIL=0
BASE="https://skill-history.com"

check() {
  local name="$1"
  local result="$2"
  if [ "$result" = "true" ]; then
    echo "✅ $name"
    PASS=$((PASS+1))
  else
    echo "❌ $name"
    FAIL=$((FAIL+1))
  fi
}

# 1. Homepage returns 200
status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "Homepage returns 200" "$([ "$status" = "200" ] && echo true)"

# 2. Skill page returns 200
status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/gavinlinasd/self-preserve")
check "Skill page returns 200" "$([ "$status" = "200" ] && echo true)"

# 3. Chart SVG returns correct content type
ct=$(curl -s -o /dev/null -w "%{content_type}" "$BASE/chart/gavinlinasd/self-preserve.svg")
check "Chart SVG content type" "$(echo "$ct" | grep -q 'image/svg+xml' && echo true)"

# 4. Badge SVG returns correct content type
ct=$(curl -s -o /dev/null -w "%{content_type}" "$BASE/badge/gavinlinasd/self-preserve.svg")
check "Badge SVG content type" "$(echo "$ct" | grep -q 'image/svg+xml' && echo true)"

# 5. JSON API returns valid JSON
body=$(curl -s -H "Accept: application/json" "$BASE/gavinlinasd/self-preserve")
check "JSON API returns skill data" "$(echo "$body" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("true" if "skill" in d and "snapshots" in d else "false")' 2>/dev/null)"

# 6. Search API returns results
body=$(curl -s "$BASE/api/search?q=self-preserve")
check "Search API returns results" "$(echo "$body" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("true" if len(d.get("results",[])) > 0 else "false")' 2>/dev/null)"

# 7. Search API minimum 2 chars
body=$(curl -s "$BASE/api/search?q=a")
check "Search API rejects 1 char" "$(echo "$body" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("true" if len(d.get("results",[])) == 0 else "false")' 2>/dev/null)"

# 8. Search by handle works
body=$(curl -s "$BASE/api/search?q=gavinlinasd")
check "Search by handle" "$(echo "$body" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("true" if any(r["handle"]=="gavinlinasd" for r in d.get("results",[])) else "false")' 2>/dev/null)"

# 9. 404 for unknown skill
status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/nonexistent/fakeskill")
check "404 for unknown skill" "$([ "$status" = "404" ] && echo true)"

# 10. FAQ page returns 200
status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/faq")
check "FAQ page returns 200" "$([ "$status" = "200" ] && echo true)"

# 11. robots.txt exists
status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/robots.txt")
check "robots.txt returns 200" "$([ "$status" = "200" ] && echo true)"

# 12. sitemap.xml exists
status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/sitemap.xml")
check "sitemap.xml returns 200" "$([ "$status" = "200" ] && echo true)"

# 13. llms.txt exists and mentions MCP
body=$(curl -s "$BASE/llms.txt")
check "llms.txt mentions MCP" "$(echo "$body" | grep -q 'MCP' && echo true)"

# 14. OpenAPI spec exists
body=$(curl -s "$BASE/api/openapi.json")
check "OpenAPI spec valid" "$(echo "$body" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("true" if d.get("openapi","").startswith("3.") else "false")' 2>/dev/null)"

# 15. MCP endpoint responds to initialize
body=$(curl -s -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}')
check "MCP initialize" "$(echo "$body" | grep -q 'skill-history' && echo true)"

# 16. MCP tools/list returns 2 tools
body=$(curl -s -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}')
check "MCP lists 2 tools" "$(echo "$body" | grep -q 'get_skill_downloads' && echo "$body" | grep -q 'search_skills' && echo true)"

# 17. MCP get_skill_downloads works
body=$(curl -s -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_skill_downloads","arguments":{"handle":"gavinlinasd","slug":"self-preserve"}}}')
check "MCP get_skill_downloads" "$(echo "$body" | grep -q 'Self Preserve' && echo true)"

# 18. MCP search_skills works
body=$(curl -s -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search_skills","arguments":{"query":"browser","limit":3}}}')
check "MCP search_skills" "$(echo "$body" | grep -q 'browser' && echo true)"

# Summary
echo
echo "Results: $PASS passed, $FAIL failed out of $((PASS+FAIL)) tests"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
