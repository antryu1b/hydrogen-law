#!/usr/bin/env python3
"""Build article -> PDF page map for the marine standards.

Reads per-page text from the marine PDFs and matches each article
(queried directly from Supabase law_articles, mirroring the
marine-compare API's cleanLabel) to the first page containing its
heading. Output is committed as apps/web/src/data/marine-page-map.json
and consumed by the marine-compare API to attach a `page` per item.

Usage: /tmp/marinevenv/bin/python scripts/build-marine-page-map.py
"""
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
PDFS = {
    "MOFFC-2024": ROOT / "apps/web/data/kgs_pdfs/MOFFC_2024.pdf",
    "GC12K-2024": ROOT / "apps/web/data/kgs_pdfs/GC12K_2024.pdf",
    "KRLFP-2026": ROOT / "apps/web/data/kgs_pdfs/KRLFP_2026.pdf",
}
OUT = ROOT / "apps/web/src/data/marine-page-map.json"


def load_env() -> tuple[str, str]:
    url = key = None
    for line in open(ROOT / ".env.local", encoding="utf-8"):
        if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
            url = line.split("=", 1)[1].strip().strip('"').strip("'")
        elif line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
            key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not url or not key:
        sys.exit("missing supabase env")
    return url, key


def clean_label(s: str) -> str:
    """Mirror of the API's cleanLabel: strip trailing dots/middots/space."""
    return re.sub(r"[·\s.]+$", "", s or "").strip()


def fetch_articles(url: str, key: str, law_id: str) -> list[dict]:
    q = urllib.parse.urlencode(
        {"law_id": f"eq.{law_id}", "select": "article_no,title", "limit": "1000"}
    )
    req = urllib.request.Request(
        f"{url}/rest/v1/law_articles?{q}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def norm(s: str) -> str:
    """Normalize for containment search: drop whitespace, dots, dot leaders."""
    return re.sub(r"[\s.·…()]+", "", s or "")


def page_texts(pdf_path: Path) -> list[str]:
    reader = PdfReader(str(pdf_path))
    return [norm(p.extract_text() or "") for p in reader.pages]


def find_page(pages: list[str], candidates: list[str]) -> int | None:
    for cand in candidates:
        if len(cand) < 4:
            continue
        for i, text in enumerate(pages):
            if cand in text:
                return i + 1  # 1-based page number
    return None


def main() -> None:
    url, key = load_env()
    result: dict[str, dict[str, int]] = {}
    missing = 0

    for law_id, pdf in PDFS.items():
        if not pdf.exists():
            print(f"!! PDF missing for {law_id}", file=sys.stderr)
            continue
        pages = page_texts(pdf)
        result[law_id] = {}
        rows = fetch_articles(url, key, law_id)
        for r in rows:
            ano = clean_label(r.get("article_no") or "")
            title = clean_label(r.get("title") or "")
            key_ = f"{ano}||{title}"
            n_ano, n_title = norm(ano), norm(title)
            candidates = [
                n_ano + n_title,
                n_ano,
                n_title,
                (n_ano + n_title)[:16],
                n_ano[:12],
            ]
            page = find_page(pages, candidates)
            if page is None:
                missing += 1
            else:
                result[law_id][key_] = page
        print(f"{law_id}: {len(result[law_id])}/{len(rows)} mapped")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1))
    print(f"wrote {OUT} (missing: {missing})")


if __name__ == "__main__":
    main()
