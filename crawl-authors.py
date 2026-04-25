#!/usr/bin/env python3
"""
Crawl GitHub profiles for skill-history.com author contact info.
Processes handles from handles-batch1.txt, writes to author-contacts.internal.csv.
Uses `gh api` for authentication. Supports resume via .crawl-progress file.
"""

import subprocess
import json
import csv
import os
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HANDLES_FILE = os.path.join(SCRIPT_DIR, "handles-batch1.txt")
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "author-contacts.internal.csv")
PROGRESS_FILE = os.path.join(SCRIPT_DIR, ".crawl-progress")

FIELDS = ["handle", "name", "email", "twitter", "blog", "bio", "company", "location", "followers", "public_repos"]


def fetch_user(handle: str) -> dict | None:
    """Fetch a GitHub user profile via gh api. Returns dict or None on 404/error."""
    try:
        result = subprocess.run(
            ["gh", "api", f"users/{handle}"],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode != 0:
            stderr = result.stderr.lower()
            if "404" in stderr or "not found" in stderr:
                return None
            if "rate limit" in stderr:
                return "RATE_LIMITED"
            # Other error
            print(f"  ERROR [{handle}]: {result.stderr.strip()}", file=sys.stderr)
            return None
        return json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        print(f"  EXCEPTION [{handle}]: {e}", file=sys.stderr)
        return None


def extract_row(data: dict) -> dict:
    """Extract contact fields from GitHub API response."""
    bio = (data.get("bio") or "").replace("\n", " ").replace("\r", " ").strip()
    return {
        "handle": data.get("login", ""),
        "name": data.get("name") or "",
        "email": data.get("email") or "",
        "twitter": data.get("twitter_username") or "",
        "blog": data.get("blog") or "",
        "bio": bio,
        "company": data.get("company") or "",
        "location": data.get("location") or "",
        "followers": data.get("followers", 0),
        "public_repos": data.get("public_repos", 0),
    }


def main():
    # Load handles
    with open(HANDLES_FILE) as f:
        handles = [line.strip() for line in f if line.strip()]

    total = len(handles)
    print(f"Total handles to process: {total}")

    # Resume support
    start_idx = 0
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            start_idx = int(f.read().strip())
        print(f"Resuming from index {start_idx}")
    else:
        # Write CSV header
        with open(OUTPUT_FILE, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDS)
            writer.writeheader()

    # Stats
    processed = 0
    skipped_404 = 0
    errors = 0
    has_email = 0
    has_twitter = 0
    has_blog = 0
    has_any_contact = 0

    # Open CSV in append mode
    csvfile = open(OUTPUT_FILE, "a", newline="")
    writer = csv.DictWriter(csvfile, fieldnames=FIELDS)

    try:
        for idx in range(start_idx, total):
            handle = handles[idx]
            processed += 1

            if processed % 100 == 0:
                elapsed_info = f"idx={idx}/{total}"
                print(f"[{time.strftime('%H:%M:%S')}] {elapsed_info} | "
                      f"done={processed} skip404={skipped_404} err={errors} | "
                      f"email={has_email} twitter={has_twitter} blog={has_blog} any_contact={has_any_contact}")
                sys.stdout.flush()

            data = fetch_user(handle)

            if data == "RATE_LIMITED":
                print(f"Rate limited at idx={idx}. Waiting 60s then retrying...", file=sys.stderr)
                time.sleep(60)
                data = fetch_user(handle)
                if data is None or data == "RATE_LIMITED":
                    errors += 1
                    # Save progress and continue
                    with open(PROGRESS_FILE, "w") as pf:
                        pf.write(str(idx + 1))
                    continue

            if data is None:
                skipped_404 += 1
                with open(PROGRESS_FILE, "w") as pf:
                    pf.write(str(idx + 1))
                continue

            row = extract_row(data)
            writer.writerow(row)
            csvfile.flush()

            # Track contact stats
            if row["email"]:
                has_email += 1
            if row["twitter"]:
                has_twitter += 1
            if row["blog"]:
                has_blog += 1
            if row["email"] or row["twitter"] or row["blog"]:
                has_any_contact += 1

            # Save progress
            with open(PROGRESS_FILE, "w") as pf:
                pf.write(str(idx + 1))

            # Polite delay: 0.05s = ~20 req/s max, well under 5000/hr limit
            time.sleep(0.05)

    except KeyboardInterrupt:
        print(f"\nInterrupted at idx={idx}. Resume will pick up here.")
    finally:
        csvfile.close()

    print()
    print("=" * 50)
    print("CRAWL SUMMARY")
    print("=" * 50)
    print(f"Handles checked:        {processed}")
    print(f"Skipped (404):          {skipped_404}")
    print(f"Errors:                 {errors}")
    print(f"Profiles found:         {processed - skipped_404 - errors}")
    print(f"Have email:             {has_email}")
    print(f"Have twitter:           {has_twitter}")
    print(f"Have blog:              {has_blog}")
    print(f"Have any contact:       {has_any_contact}")
    print(f"Output: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
