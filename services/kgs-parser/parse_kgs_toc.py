#!/usr/bin/env python3
"""
parse_kgs_toc.py
Extracts TOC + section bodies from a KGS CODE PDF using pdfplumber.
Usage: python parse_kgs_toc.py <pdf_path> [--code CODE]
Output: data/kgs_sections/<CODE>.json

Fixes applied:
  Fix A: TOC interference — only recognize section headers at page >= 10
  Fix B: Table-row false positives — filter single-digit sec_no with empty/numeric title
  Fix C: Accept umbrella headers (L1/L2) with empty body; flag as is_umbrella=true
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import List, Dict, Optional, Tuple

import pdfplumber

REPO_ROOT = Path(__file__).resolve().parents[2]
SECTIONS_DIR = REPO_ROOT / "data" / "kgs_sections"

# Section header pattern: 1. / 1.1 / 1.1.1 etc. followed by Korean/Latin text
SECTION_RE = re.compile(
    r"^[ \t]*(\d+(?:\.\d+)*)\.?\s{1,4}([가-힣A-Za-z][가-힣A-Za-z0-9·\-\(\)\s]{0,60})$"
)

# KGS standard: TOC occupies pages 1-9
TOC_PAGE_THRESHOLD = 10

MIN_TITLE_LEN = 2

# Fix B: single-digit-only section number pattern (table row artifacts)
SINGLE_DIGIT_SEC_RE = re.compile(r"^\d+$")


def is_table_row_artifact(sec_no: str, title: str) -> bool:
    """Return True if this looks like a table row rather than a real section header.
    
    Heuristic: sec_no is a plain integer (e.g. "3", "12") AND title is either
    empty, numeric-only, or too short (<=4 chars) to be a real Korean section name.
    """
    if not SINGLE_DIGIT_SEC_RE.match(sec_no):
        return False
    # It's a single integer sec_no — check title quality
    title_stripped = title.strip()
    if not title_stripped:
        return True
    if re.match(r"^\d+[\.\d]*$", title_stripped):
        return True
    if len(title_stripped) <= 4:
        return True
    return False


def extract_text_by_page(pdf_path: Path) -> List[Tuple[int, str]]:
    """Returns list of (page_num_1based, text) tuples."""
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        print(f"[parse] PDF has {total} pages", file=sys.stderr)
        for i, page in enumerate(pdf.pages):
            text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
            pages.append((i + 1, text))
    return pages


def detect_version_date(pages: List[Tuple[int, str]], code: str) -> Optional[str]:
    """Try to extract version date from first few pages."""
    date_re = re.compile(r"20\d{2}[\.\-]\d{2}[\.\-]\d{2}")
    for page_no, text in pages[:5]:
        m = date_re.search(text)
        if m:
            return m.group(0).replace(".", "-").replace("/", "-")
    return None


def parse_sections(pages: List[Tuple[int, str]]) -> Tuple[List[Dict], List[Dict]]:
    """
    Walk through all pages line by line.
    When a section header is detected (page >= TOC_PAGE_THRESHOLD), start a new section.
    Lines from pages < TOC_PAGE_THRESHOLD are recorded as toc_artifacts if they match.

    Returns: (sections, toc_artifacts)
    
    Fix A: Skip section headers found on pages < TOC_PAGE_THRESHOLD.
    Fix B: Skip table-row artifacts (single-digit sec_no + weak title).
    Fix C: L1/L2 sections with empty body are valid umbrella headers; marked is_umbrella=True.
    """
    all_lines: List[Tuple[int, int, str]] = []  # (page_no, line_in_page, text)
    for page_no, text in pages:
        for li, line in enumerate(text.splitlines()):
            all_lines.append((page_no, li, line))

    section_positions: List[Tuple[int, int, str, str, int]] = []
    # (line_global_idx, page_no, sec_no, title, level)
    
    toc_artifact_positions: List[Dict] = []

    for global_idx, (page_no, li, line) in enumerate(all_lines):
        m = SECTION_RE.match(line)
        if not m:
            continue
        
        sec_no = m.group(1)
        title = m.group(2).strip()
        level = sec_no.count(".") + 1

        if len(title) < MIN_TITLE_LEN:
            continue

        # Fix A: TOC pages
        if page_no < TOC_PAGE_THRESHOLD:
            toc_artifact_positions.append({
                "sec_no": sec_no,
                "title": title,
                "level": level,
                "page_no": page_no,
                "reason": "toc_page",
            })
            continue

        # Fix B: table row false positives
        if is_table_row_artifact(sec_no, title):
            toc_artifact_positions.append({
                "sec_no": sec_no,
                "title": title,
                "level": level,
                "page_no": page_no,
                "reason": "table_row_artifact",
            })
            continue

        section_positions.append((global_idx, page_no, sec_no, title, level))

    if not section_positions:
        print("[WARNING] No section headers detected!", file=sys.stderr)
        return [], toc_artifact_positions

    print(f"[parse] Detected {len(section_positions)} section headers (skipped {len(toc_artifact_positions)} artifacts)", file=sys.stderr)

    sections = []
    for i, (g_idx, page_no, sec_no, title, level) in enumerate(section_positions):
        body_lines = []
        start = g_idx + 1
        end = section_positions[i + 1][0] if i + 1 < len(section_positions) else len(all_lines)

        for j in range(start, end):
            _, _, body_line = all_lines[j]
            body_lines.append(body_line)

        body = "\n".join(body_lines).strip()

        page_start = page_no
        page_end = all_lines[end - 1][0] if end > start else page_no

        # Fix C: umbrella detection (L1/L2 with empty body are valid navigational headers)
        is_umbrella = (level <= 2) and (len(body) == 0)

        section = {
            "sec_no": sec_no,
            "title": title,
            "level": level,
            "page_start": page_start,
            "page_end": page_end,
            "body": body,
        }
        if is_umbrella:
            section["is_umbrella"] = True

        sections.append(section)

    return sections, toc_artifact_positions


def derive_code_from_path(pdf_path: Path) -> str:
    m = re.match(r"^([A-Z]{2}\d{3})", pdf_path.stem)
    return m.group(1) if m else pdf_path.stem


def derive_date_from_path(pdf_path: Path) -> Optional[str]:
    m = re.search(r"[-_](\d{6})\.", pdf_path.name)
    if m:
        raw = m.group(1)
        return f"20{raw[:2]}-{raw[2:4]}-{raw[4:6]}"
    return None


def main():
    parser = argparse.ArgumentParser(description="Parse KGS code PDF into sections JSON")
    parser.add_argument("pdf_path", help="Path to PDF file")
    parser.add_argument("--code", help="Code override (e.g. FP217)", default=None)
    args = parser.parse_args()

    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        print(f"[ERROR] PDF not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    code = args.code or derive_code_from_path(pdf_path)
    version_date = derive_date_from_path(pdf_path)

    print(f"[parse_kgs_toc] code={code} pdf={pdf_path.name}", file=sys.stderr)

    pages = extract_text_by_page(pdf_path)

    # Check if PDF is scanned (all pages return empty text)
    non_empty = sum(1 for _, t in pages if len(t.strip()) > 50)
    if non_empty == 0:
        print("[ERROR] PDF appears to be a scanned image (no extractable text). OCR fallback needed.", file=sys.stderr)
        sys.exit(3)
    if non_empty < len(pages) * 0.3:
        print(f"[WARNING] Only {non_empty}/{len(pages)} pages have extractable text. Partial OCR scan?", file=sys.stderr)

    version_date = version_date or detect_version_date(pages, code)

    first_page_text = pages[0][1] if pages else ""
    title_candidate = ""
    for line in first_page_text.splitlines()[:20]:
        line = line.strip()
        if len(line) > 5 and "기준" in line:
            title_candidate = line
            break

    sections, toc_artifacts = parse_sections(pages)

    depth_dist: Dict[int, int] = {}
    for s in sections:
        depth_dist[s["level"]] = depth_dist.get(s["level"], 0) + 1

    # Fix C: umbrella sections are valid; only flag non-umbrella empty-body as orphaned
    umbrella_sections = [s for s in sections if s.get("is_umbrella")]
    orphaned = [s for s in sections if not s["body"].strip() and not s.get("is_umbrella")]
    low_confidence = [s for s in sections if 0 < len(s["body"]) < 20]

    print(f"[stats] sections={len(sections)}, depth_dist={depth_dist}", file=sys.stderr)
    print(f"[stats] umbrella={len(umbrella_sections)}, orphaned (non-umbrella, no body)={len(orphaned)}, low_confidence (body<20)={len(low_confidence)}", file=sys.stderr)
    print(f"[stats] toc_artifacts_skipped={len(toc_artifacts)}", file=sys.stderr)

    output = {
        "code": code,
        "title": title_candidate or "(unknown)",
        "version_date": version_date,
        "page_count": len(pages),
        "section_count": len(sections),
        "depth_distribution": depth_dist,
        "umbrella_count": len(umbrella_sections),
        "orphaned_count": len(orphaned),
        "low_confidence_count": len(low_confidence),
        "toc_artifacts_skipped": len(toc_artifacts),
        "sections": sections,
        "toc_artifacts": toc_artifacts,
    }

    SECTIONS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = SECTIONS_DIR / f"{code}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"[done] Wrote {out_path}", file=sys.stderr)

    print(f"\n=== Parse Summary: {code} ===")
    print(f"  title: {output['title']}")
    print(f"  version_date: {version_date}")
    print(f"  pages: {len(pages)}")
    print(f"  sections: {len(sections)}")
    print(f"  depth_distribution: {depth_dist}")
    print(f"  umbrella_sections: {len(umbrella_sections)}")
    print(f"  orphaned_sections (non-umbrella, no body): {len(orphaned)}")
    print(f"  low_confidence: {len(low_confidence)}")
    print(f"  toc_artifacts_skipped: {len(toc_artifacts)}")

    print("\n--- First 5 sections ---")
    for s in sections[:5]:
        umbrella_flag = " [UMBRELLA]" if s.get("is_umbrella") else ""
        body_len = len(s["body"])
        print(f"  [{s['sec_no']}] {s['title']} (L{s['level']}, p{s['page_start']}-{s['page_end']}, body={body_len} chars){umbrella_flag}")

    print("\n--- Sample body text (2 largest non-umbrella sections, first 300 chars) ---")
    non_umbrella = [s for s in sections if not s.get("is_umbrella") and s["body"]]
    top2 = sorted(non_umbrella, key=lambda s: len(s["body"]), reverse=True)[:2]
    for s in top2:
        print(f"\n  [{s['sec_no']}] {s['title']}:")
        print(f"  {s['body'][:300]}")


if __name__ == "__main__":
    main()
