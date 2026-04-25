#!/usr/bin/env python3
"""Crawl remaining GitHub profiles, appending to author-contacts.internal.csv"""
import csv, json, os, sys, time, subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HANDLES_FILE = os.path.join(SCRIPT_DIR, "handles-remaining.txt")
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "author-contacts.internal.csv")
FIELDS = ["handle", "name", "email", "twitter", "blog", "bio", "company", "location", "followers", "public_repos"]

TOKEN = subprocess.check_output(["gh", "auth", "token"], text=True).strip()

import urllib.request

def fetch_profile(handle):
    url = f"https://api.github.com/users/{handle}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"token {TOKEN}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "skill-history-contact-crawler",
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return {
                "handle": handle,
                "name": data.get("name") or "",
                "email": data.get("email") or "",
                "twitter": data.get("twitter_username") or "",
                "blog": data.get("blog") or "",
                "bio": (data.get("bio") or "").replace("\n", " ").replace(",", ";"),
                "company": (data.get("company") or "").replace(",", ";"),
                "location": (data.get("location") or "").replace(",", ";"),
                "followers": data.get("followers", 0),
                "public_repos": data.get("public_repos", 0),
            }
    except Exception as e:
        if "404" in str(e):
            return None
        if "429" in str(e):
            print(f"Rate limited at {handle}, sleeping 60s...", file=sys.stderr)
            time.sleep(60)
            return fetch_profile(handle)  # retry once
        print(f"Error {handle}: {e}", file=sys.stderr)
        return None

with open(HANDLES_FILE) as f:
    handles = [line.strip() for line in f if line.strip()]

print(f"Processing {len(handles)} handles...", file=sys.stderr)

with open(OUTPUT_FILE, "a", newline="") as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=FIELDS)
    
    for i, handle in enumerate(handles):
        profile = fetch_profile(handle)
        if profile:
            writer.writerow(profile)
        
        if (i + 1) % 100 == 0:
            remaining_api = 5000  # approximate
            print(f"  [{i+1}/{len(handles)}] processed", file=sys.stderr)
            csvfile.flush()
        
        time.sleep(0.1)  # ~10 req/s, well under limits

print(f"Done. Processed {len(handles)} handles.", file=sys.stderr)
