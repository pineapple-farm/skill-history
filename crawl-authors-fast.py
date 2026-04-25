#!/usr/bin/env python3
"""
Fast GitHub profile crawler using direct HTTP requests with auth token.
Uses concurrent requests for speed while staying well under rate limits.
"""

import csv
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HANDLES_FILE = os.path.join(SCRIPT_DIR, "handles-batch1.txt")
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "author-contacts.internal.csv")
PROGRESS_FILE = os.path.join(SCRIPT_DIR, ".crawl-progress")

FIELDS = ["handle", "name", "email", "twitter", "blog", "bio", "company", "location", "followers", "public_repos"]

# Get token from gh CLI
TOKEN = subprocess.check_output(["gh", "auth", "token"], text=True).strip()
HEADERS = {
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "skill-history-contact-crawler",
}

# Session for connection pooling
session = requests.Session()
session.headers.update(HEADERS)

# Concurrency: 10 workers is polite and fast (~10 req/s = 36000/hr, but we only need 2000)
WORKERS = 10


def fetch_user(handle: str) -> tuple[str, dict | None]:
    """Fetch a single user. Returns (handle, data_dict_or_None)."""
    try:
        resp = session.get(f"https://api.github.com/users/{handle}", timeout=10)
        if resp.status_code == 404:
            return (handle, None)
        if resp.status_code == 403:
            # Rate limited - check headers
            remaining = int(resp.headers.get("X-RateLimit-Remaining", 0))
            if remaining == 0:
                reset_time = int(resp.headers.get("X-RateLimit-Reset", 0))
                wait = max(0, reset_time - int(time.time())) + 5
                print(f"Rate limited! Waiting {wait}s...", file=sys.stderr)
                time.sleep(wait)
                # Retry once
                resp = session.get(f"https://api.github.com/users/{handle}", timeout=10)
                if resp.status_code != 200:
                    return (handle, None)
            else:
                return (handle, None)
        if resp.status_code != 200:
            print(f"  HTTP {resp.status_code} for {handle}", file=sys.stderr)
            return (handle, None)

        data = resp.json()
        bio = (data.get("bio") or "").replace("\n", " ").replace("\r", " ").strip()
        return (handle, {
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
        })
    except Exception as e:
        print(f"  EXCEPTION [{handle}]: {e}", file=sys.stderr)
        return (handle, None)


def main():
    # Load handles
    with open(HANDLES_FILE) as f:
        handles = [line.strip() for line in f if line.strip()]

    total = len(handles)
    print(f"Total handles: {total}")

    # Check rate limit first
    rl = session.get("https://api.github.com/rate_limit").json()
    remaining = rl["resources"]["core"]["remaining"]
    limit = rl["resources"]["core"]["limit"]
    print(f"Rate limit: {remaining}/{limit} remaining")

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

    handles_to_process = handles[start_idx:]
    print(f"Processing {len(handles_to_process)} handles starting from index {start_idx}")

    # Stats
    processed = 0
    skipped_404 = 0
    found = 0
    has_email = 0
    has_twitter = 0
    has_blog = 0
    has_any_contact = 0

    # Process in batches for progress tracking
    BATCH_SIZE = 50
    csvfile = open(OUTPUT_FILE, "a", newline="")
    writer = csv.DictWriter(csvfile, fieldnames=FIELDS)

    try:
        for batch_start in range(0, len(handles_to_process), BATCH_SIZE):
            batch = handles_to_process[batch_start:batch_start + BATCH_SIZE]

            with ThreadPoolExecutor(max_workers=WORKERS) as executor:
                futures = {executor.submit(fetch_user, h): h for h in batch}
                results = []
                for future in as_completed(futures):
                    handle, data = future.result()
                    results.append((handle, data))
                    processed += 1

            # Write results in order
            for handle, data in results:
                if data is None:
                    skipped_404 += 1
                    continue

                found += 1
                writer.writerow(data)

                if data["email"]:
                    has_email += 1
                if data["twitter"]:
                    has_twitter += 1
                if data["blog"]:
                    has_blog += 1
                if data["email"] or data["twitter"] or data["blog"]:
                    has_any_contact += 1

            csvfile.flush()

            # Save progress
            current_idx = start_idx + batch_start + len(batch)
            with open(PROGRESS_FILE, "w") as pf:
                pf.write(str(current_idx))

            global_idx = start_idx + batch_start + len(batch)
            print(f"[{time.strftime('%H:%M:%S')}] {global_idx}/{total} | "
                  f"found={found} skip404={skipped_404} | "
                  f"email={has_email} twitter={has_twitter} blog={has_blog} any={has_any_contact}")
            sys.stdout.flush()

    except KeyboardInterrupt:
        print(f"\nInterrupted. Progress saved.")
    finally:
        csvfile.close()

    print()
    print("=" * 50)
    print("CRAWL SUMMARY")
    print("=" * 50)
    print(f"Handles checked:        {processed}")
    print(f"Profiles found:         {found}")
    print(f"Skipped (404/error):    {skipped_404}")
    print(f"Have email:             {has_email}  ({100*has_email/max(found,1):.1f}%)")
    print(f"Have twitter:           {has_twitter}  ({100*has_twitter/max(found,1):.1f}%)")
    print(f"Have blog:              {has_blog}  ({100*has_blog/max(found,1):.1f}%)")
    print(f"Have any contact:       {has_any_contact}  ({100*has_any_contact/max(found,1):.1f}%)")
    print(f"Output: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
