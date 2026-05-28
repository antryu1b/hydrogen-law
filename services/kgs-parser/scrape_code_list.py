#!/usr/bin/env python3
"""
scrape_code_list.py
Scrapes ALL pages of the KGS code listing to get updated PDF filenames.
Paginates through pageIndex 1..N (10 codes/page) until empty page.
Outputs data/kgs-codes-current.json with pdfUrl_old / pdfUrl_current / is_stale per code.
"""

import json
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://cyber.kgs.or.kr"
MAIN_URL = f"{BASE_URL}/co/main/main.do"
LIST_URL = f"{BASE_URL}/kgscode.codeSearch.listV2.ex.do"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": LIST_URL,
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Content-Type": "application/x-www-form-urlencoded",
}

REPO_ROOT = Path(__file__).resolve().parents[2]
OLD_JSON_PATH = REPO_ROOT / "data" / "kgs-codes-full.json"
OUTPUT_PATH = REPO_ROOT / "data" / "kgs-codes-current.json"

THROTTLE_SEC = 1  # polite delay between page fetches


def seed_session() -> requests.Session:
    """GET main page to obtain session cookie."""
    session = requests.Session()
    resp = session.get(MAIN_URL, headers={"User-Agent": HEADERS["User-Agent"]}, timeout=20)
    resp.raise_for_status()
    print(f"[seed] GET main.do -> {resp.status_code}, cookies: {dict(session.cookies)}", file=sys.stderr)
    return session


def fetch_all_pages(session: requests.Session) -> dict[str, str]:
    """
    Paginate through list pages, collecting code -> file_nm mappings.
    Returns dict: { "FP217": "kgscode_pdf/2026/FP217-260508.pdf", ... }
    """
    pattern = re.compile(
        r"file_nm=(kgscode_pdf/\d{4}/([A-Z]{2}\d{3})[-_](\d{6})\.pdf)"
    )
    all_codes: dict[str, str] = {}
    page = 1
    max_pages = 20  # safety cap

    while page <= max_pages:
        resp = session.post(
            LIST_URL,
            data={"pageIndex": str(page), "pblcCd": "", "pblcNm": "", "pubEng2": ""},
            headers=HEADERS,
            timeout=20,
        )
        resp.raise_for_status()

        if "kgsFileDown" not in resp.text:
            print(f"[page {page}] No codes found — stopping pagination", file=sys.stderr)
            break

        found_this_page = []
        for m in pattern.finditer(resp.text):
            file_nm = m.group(1)
            code = m.group(2)
            if code not in all_codes:
                all_codes[code] = file_nm
                found_this_page.append(code)

        print(f"[page {page}] {len(found_this_page)} new codes: {found_this_page}", file=sys.stderr)

        if len(found_this_page) == 0:
            print(f"[page {page}] No new codes — stopping", file=sys.stderr)
            break

        page += 1
        if page <= max_pages:
            time.sleep(THROTTLE_SEC)

    return all_codes


def load_old_codes() -> list[dict]:
    with open(OLD_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("codes", [])


def build_current_json(old_codes: list[dict], scraped: dict[str, str]) -> list[dict]:
    result = []
    for entry in old_codes:
        code = entry["code"]
        old_url = entry.get("pdfUrl", "")
        current_url = scraped.get(code)

        date_current = None
        if current_url:
            m = re.search(r"[-_](\d{6})\.pdf$", current_url)
            if m:
                raw = m.group(1)
                date_current = f"20{raw[:2]}-{raw[2:4]}-{raw[4:6]}"

        is_stale = (current_url is not None) and (current_url != old_url)
        not_found = current_url is None

        result.append({
            "code": code,
            "name": entry.get("name", ""),
            "pdfUrl_old": old_url,
            "pdfUrl_current": current_url,
            "date_current": date_current,
            "is_stale": is_stale,
            "not_found_on_server": not_found,
        })
    return result


def main():
    print("[scrape_code_list] Starting paginated scrape...", file=sys.stderr)
    session = seed_session()
    scraped = fetch_all_pages(session)

    old_codes = load_old_codes()
    current = build_current_json(old_codes, scraped)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump({"codes": current, "scraped_total": len(scraped)}, f, ensure_ascii=False, indent=2)

    print(f"[done] Wrote {OUTPUT_PATH}", file=sys.stderr)

    stale = [c for c in current if c["is_stale"]]
    not_found = [c for c in current if c["not_found_on_server"]]
    print(f"\nTotal old codes in kgs-codes-full.json: {len(old_codes)}")
    print(f"Total codes scraped from server: {len(scraped)}")
    print(f"Stale (different filename): {len(stale)} -> {[c['code'] for c in stale]}")
    print(f"Not found on server: {len(not_found)} -> {[c['code'] for c in not_found]}")
    print(f"FP217 current url: {scraped.get('FP217', 'NOT FOUND')}")


if __name__ == "__main__":
    main()
