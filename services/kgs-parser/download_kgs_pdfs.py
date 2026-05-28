#!/usr/bin/env python3
"""
download_kgs_pdfs.py
Downloads KGS code PDFs for given codes using POST + session cookies.
Usage: python download_kgs_pdfs.py [CODE1 CODE2 ...]
Default codes: FP217 FU671 AC421
"""

import json
import sys
import time
from pathlib import Path

import requests

BASE_URL = "https://cyber.kgs.or.kr"
MAIN_URL = f"{BASE_URL}/co/main/main.do"
LIST_URL = f"{BASE_URL}/kgscode.codeSearch.listV2.ex.do"
DOWNLOAD_URL = f"{BASE_URL}/cmm/fms/kgsFileDown.ex.do"

HEADERS_BASE = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
}

REPO_ROOT = Path(__file__).resolve().parents[2]
CURRENT_JSON_PATH = REPO_ROOT / "data" / "kgs-codes-current.json"
PDF_DIR = REPO_ROOT / "data" / "kgs_pdfs"

THROTTLE_SEC = 2


def seed_session() -> requests.Session:
    session = requests.Session()
    resp = session.get(MAIN_URL, headers=HEADERS_BASE, timeout=20)
    resp.raise_for_status()
    print(f"[seed] GET main.do -> {resp.status_code}, cookies: {dict(session.cookies)}", file=sys.stderr)
    return session


def load_current_map() -> dict[str, str]:
    """Load code -> pdfUrl_current from kgs-codes-current.json."""
    if not CURRENT_JSON_PATH.exists():
        print(f"[ERROR] {CURRENT_JSON_PATH} not found. Run scrape_code_list.py first.", file=sys.stderr)
        sys.exit(1)
    with open(CURRENT_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    mapping = {}
    for entry in data.get("codes", []):
        if entry.get("pdfUrl_current"):
            mapping[entry["code"]] = entry["pdfUrl_current"]
    return mapping


def download_pdf(session: requests.Session, code: str, file_nm: str, out_path: Path) -> bool:
    """POST download, verify PDF magic, save to out_path. Returns True on success."""
    post_data = {
        "file_nm": file_nm,
        "file_folder": "codeLink",
    }
    headers = {
        **HEADERS_BASE,
        "Referer": LIST_URL,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    print(f"[download] POST {DOWNLOAD_URL} file_nm={file_nm}", file=sys.stderr)
    resp = session.post(DOWNLOAD_URL, data=post_data, headers=headers, timeout=60, stream=True)

    if resp.status_code != 200:
        print(f"[ERROR] {code}: HTTP {resp.status_code}", file=sys.stderr)
        return False

    content_type = resp.headers.get("Content-Type", "")
    # If we got HTML back, it's an error page
    if "text/html" in content_type:
        snippet = resp.text[:300] if hasattr(resp, "text") else "(no text)"
        print(f"[ERROR] {code}: Got HTML response (error page). Snippet: {snippet}", file=sys.stderr)
        return False

    # Read content
    content = resp.content
    if len(content) < 100:
        print(f"[ERROR] {code}: Response too small ({len(content)} bytes)", file=sys.stderr)
        return False

    # Verify PDF magic bytes
    if not content.startswith(b"%PDF-"):
        print(f"[ERROR] {code}: Missing PDF magic bytes. First 8 bytes: {content[:8]}", file=sys.stderr)
        return False

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(content)
    print(f"[ok] {code}: Saved {len(content):,} bytes -> {out_path.name}", file=sys.stderr)
    return True


def main():
    codes_arg = sys.argv[1:] if len(sys.argv) > 1 else ["FP217", "FU671", "AC421"]
    print(f"[download_kgs_pdfs] Target codes: {codes_arg}", file=sys.stderr)

    code_map = load_current_map()
    session = seed_session()

    results = {}
    for i, code in enumerate(codes_arg):
        if i > 0:
            print(f"[throttle] sleeping {THROTTLE_SEC}s...", file=sys.stderr)
            time.sleep(THROTTLE_SEC)

        if code not in code_map:
            print(f"[SKIP] {code}: not found in kgs-codes-current.json", file=sys.stderr)
            results[code] = {"status": "not_found"}
            continue

        file_nm = code_map[code]
        # Derive output filename from path
        filename = file_nm.split("/")[-1]
        out_path = PDF_DIR / filename

        if out_path.exists():
            print(f"[skip] {code}: already exists at {out_path}", file=sys.stderr)
            results[code] = {"status": "cached", "path": str(out_path), "size": out_path.stat().st_size}
            continue

        ok = download_pdf(session, code, file_nm, out_path)
        if not ok:
            print(f"[HALT] Download failed for {code}. Stopping per hard constraint.", file=sys.stderr)
            results[code] = {"status": "error"}
            # Report partial results then exit
            _print_results(results)
            sys.exit(2)

        size = out_path.stat().st_size
        results[code] = {"status": "ok", "path": str(out_path), "size": size, "file_nm": file_nm}

    _print_results(results)


def _print_results(results: dict):
    print("\n=== Download Results ===")
    for code, info in results.items():
        status = info["status"]
        if status == "ok" or status == "cached":
            print(f"  {code}: {status} | {info['size']:,} bytes | {Path(info['path']).name}")
        else:
            print(f"  {code}: {status}")


if __name__ == "__main__":
    main()
