#!/usr/bin/env bash
# Crawl GitHub profiles for skill-history.com author contact info
# Processes handles from handles-batch1.txt, writes to author-contacts.internal.csv

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HANDLES_FILE="$SCRIPT_DIR/handles-batch1.txt"
OUTPUT_FILE="$SCRIPT_DIR/author-contacts.internal.csv"
PROGRESS_FILE="$SCRIPT_DIR/.crawl-progress"

# Resume support: track which line we left off at
START_LINE=1
if [[ -f "$PROGRESS_FILE" ]]; then
  START_LINE=$(cat "$PROGRESS_FILE")
  echo "Resuming from line $START_LINE"
else
  # Write CSV header
  echo 'handle,name,email,twitter,blog,bio,company,location,followers,public_repos' > "$OUTPUT_FILE"
fi

TOTAL=$(wc -l < "$HANDLES_FILE" | tr -d ' ')
CURRENT=0
SKIPPED=0
ERRORS=0

escape_csv() {
  # Escape a field for CSV: wrap in quotes if it contains comma, quote, or newline
  local val="$1"
  if [[ "$val" == *","* ]] || [[ "$val" == *'"'* ]] || [[ "$val" == *$'\n'* ]]; then
    val="${val//\"/\"\"}"
    echo "\"$val\""
  else
    echo "$val"
  fi
}

while IFS= read -r handle; do
  CURRENT=$((CURRENT + 1))

  # Skip lines we've already processed (resume support)
  if [[ $CURRENT -lt $START_LINE ]]; then
    continue
  fi

  # Progress logging every 50 handles
  if (( CURRENT % 50 == 0 )); then
    echo "[$(date '+%H:%M:%S')] Progress: $CURRENT / $TOTAL (skipped: $SKIPPED, errors: $ERRORS)"
  fi

  # Query GitHub API
  RESPONSE=$(gh api "users/$handle" 2>&1) || {
    STATUS=$?
    if echo "$RESPONSE" | grep -q "404"; then
      SKIPPED=$((SKIPPED + 1))
    else
      ERRORS=$((ERRORS + 1))
      echo "ERROR on $handle: $RESPONSE" >&2
      # If rate limited, wait and retry
      if echo "$RESPONSE" | grep -qi "rate limit"; then
        echo "Rate limited! Waiting 60s..." >&2
        sleep 60
        RESPONSE=$(gh api "users/$handle" 2>&1) || {
          SKIPPED=$((SKIPPED + 1))
          echo $((CURRENT + 1)) > "$PROGRESS_FILE"
          continue
        }
        # Fall through to process the response
        :
      else
        echo $((CURRENT + 1)) > "$PROGRESS_FILE"
        continue
      fi
    fi

    if echo "$RESPONSE" | grep -q "404"; then
      echo $((CURRENT + 1)) > "$PROGRESS_FILE"
      continue
    fi
  }

  # Parse JSON response
  login=$(echo "$RESPONSE" | jq -r '.login // ""')
  name=$(echo "$RESPONSE" | jq -r '.name // ""')
  email=$(echo "$RESPONSE" | jq -r '.email // ""')
  twitter=$(echo "$RESPONSE" | jq -r '.twitter_username // ""')
  blog=$(echo "$RESPONSE" | jq -r '.blog // ""')
  bio=$(echo "$RESPONSE" | jq -r '.bio // ""' | tr '\n' ' ' | tr '\r' ' ')
  company=$(echo "$RESPONSE" | jq -r '.company // ""')
  location=$(echo "$RESPONSE" | jq -r '.location // ""')
  followers=$(echo "$RESPONSE" | jq -r '.followers // 0')
  public_repos=$(echo "$RESPONSE" | jq -r '.public_repos // 0')

  # Write CSV row
  printf '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n' \
    "$(escape_csv "$login")" \
    "$(escape_csv "$name")" \
    "$(escape_csv "$email")" \
    "$(escape_csv "$twitter")" \
    "$(escape_csv "$blog")" \
    "$(escape_csv "$bio")" \
    "$(escape_csv "$company")" \
    "$(escape_csv "$location")" \
    "$followers" \
    "$public_repos" >> "$OUTPUT_FILE"

  # Save progress
  echo $((CURRENT + 1)) > "$PROGRESS_FILE"

  # Small delay to be polite (0.1s = ~10 req/s, well under 5000/hr)
  sleep 0.1

done < "$HANDLES_FILE"

echo ""
echo "=== CRAWL COMPLETE ==="
echo "Total processed: $CURRENT"
echo "Skipped (404): $SKIPPED"
echo "Errors: $ERRORS"
echo "Output: $OUTPUT_FILE"
