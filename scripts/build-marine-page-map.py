#!/usr/bin/env python3
"""Build article -> PDF page map for the two marine standards.

Reads per-page text from the marine PDFs and matches each article
(from the live /api/marine-compare list, which mirrors Supabase) to the
first page containing its heading. Output is committed as
apps/web/src/data/marine-page-map.json and consumed by the
marine-compare API to attach a `page` field per item.

Usage: /tmp/marinevenv/bin/python scripts/build-marine-page-map.py
"""
import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader
import requests

ROOT = Path(__file__).resolve().parent.parent
PDFS = {
    "MOFFC-2024": ROOT / "apps/web/data/kgs_pdfs/MOFFC_2024.pdf",
    "GC12K-2024": ROOT / "apps/web/data/kgs_pdfs/GC12K_2024.pdf",
}
API = "https://hydrogen-law.vercel.app/api/marine-compare"
OUT = ROOT / "apps/web/src/data/marine-page-map.json"


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
    items = requests.get(API, timeout=30).json()["standards"]
    result: dict[str, dict[str, int]] = {}
    missing = 0

    for std in items:
        law_id = std["law_id"]
        pdf = PDFS.get(law_id)
        if not pdf or not pdf.exists():
            print(f"!! PDF missing for {law_id}", file=sys.stderr)
            continue
        pages = page_texts(pdf)
        result[law_id] = {}
        for it in std["items"]:
            ano, title = it["article_no"], it["title"]
            key = f"{ano}||{title}"
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
                print(f"  ?? no page: {law_id} {ano} {title[:30]}", file=sys.stderr)
            else:
                result[law_id][key] = page
        print(f"{law_id}: {len(result[law_id])}/{len(std['items'])} mapped")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1))
    print(f"wrote {OUT} (missing: {missing})")


if __name__ == "__main__":
    main()
