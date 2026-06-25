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
  Fix D: Appendix detection — 부록/별표/별지/Appendix patterns at line-start
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

# Appendix header patterns (line-anchored, various KGS formats):
#   부록 A / 부록A / 부록 1 / 부록A.  / 부록B
#   별표 1 / 별표 제2호 / 별표1
#   별지 제1호서식 / 별지 1
#   Appendix A / Appendix 1
APPENDIX_RE = re.compile(
    r"^[ \t]*(?:"
    r"(부록)\s*([A-Z\d]+)\.?"       # 부록 A  /  부록1  /  부록B.
    r"|"
    r"(별표)\s*제?\s*(\d+)\s*호?"   # 별표 1  /  별표 제2호
    r"|"
    r"(별지)\s*제?\s*(\d+)\s*호?\s*서식?" # 별지 제1호서식
    r"|"
    r"(Appendix)\s+([A-Z\d]+)"      # Appendix A  /  Appendix 1
    r")"
    r"(?:\s+(.+))?$",               # optional title remainder
    re.IGNORECASE,
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


def parse_appendix_line(line: str) -> Optional[Dict]:
    """
    Try to match an appendix header line.
    Returns dict with keys: kind, appendix_id, sec_no, title
    or None if not matched.

    kind: "부록" | "별표" | "별지" | "appendix"
    appendix_id: "A", "B", "1", "2", ...  (the letter/number from the pattern)
    sec_no: normalized no-space form, e.g. "부록A", "별표1", "별지1", "AppA"
    title: remainder text (may be empty string)
    """
    m = APPENDIX_RE.match(line)
    if not m:
        return None

    g = m.groups()
    # Groups: (부록_kw, 부록_id, 별표_kw, 별표_id, 별지_kw, 별지_id, app_kw, app_id, title_rest)
    # Index:       0       1        2        3        4        5       6       7         8
    title_rest = (g[8] or "").strip()

    if g[0]:  # 부록
        kind = "부록"
        appendix_id = g[1].upper()
        sec_no = f"부록{appendix_id}"
    elif g[2]:  # 별표
        kind = "별표"
        appendix_id = g[3]
        sec_no = f"별표{appendix_id}"
    elif g[4]:  # 별지
        kind = "별지"
        appendix_id = g[5]
        sec_no = f"별지{appendix_id}"
    elif g[6]:  # Appendix
        kind = "appendix"
        appendix_id = g[7].upper()
        sec_no = f"App{appendix_id}"
    else:
        return None

    return {
        "kind": kind,
        "appendix_id": appendix_id,
        "sec_no": sec_no,
        "title": title_rest,
    }


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


def parse_sections(pages: List[Tuple[int, str]]) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """
    Walk through all pages line by line.
    When a section header is detected (page >= TOC_PAGE_THRESHOLD), start a new section.
    When an appendix header is detected, start a new appendix entry.
    Lines from pages < TOC_PAGE_THRESHOLD are recorded as toc_artifacts if they match.

    Returns: (sections, appendix_sections, toc_artifacts)

    Fix A: Skip section headers found on pages < TOC_PAGE_THRESHOLD.
    Fix B: Skip table-row artifacts (single-digit sec_no + weak title).
    Fix C: L1/L2 sections with empty body are valid umbrella headers; marked is_umbrella=True.
    Fix D: Appendix headers (부록/별표/별지/Appendix) parsed into separate list.
    """
    all_lines: List[Tuple[int, int, str]] = []  # (page_no, line_in_page, text)
    for page_no, text in pages:
        for li, line in enumerate(text.splitlines()):
            all_lines.append((page_no, li, line))

    # TOC-entry pattern: trailing dots/bullets followed by optional page number.
    # e.g. "부록 A 제목·····90" or "1. 일반사항 .......... 5"
    TOC_TRAIL_RE = re.compile(r"[·.]{3,}\s*\d*\s*$")

    # --- First pass: locate all section + appendix header positions ---
    # Combined position list; type = "section" | "appendix"
    header_positions: List[Dict] = []  # {idx, page_no, type, ...}

    toc_artifact_positions: List[Dict] = []
    # Track appendix sec_nos already seen to handle dedup
    seen_appendix_secnos: set = set()

    for global_idx, (page_no, li, line) in enumerate(all_lines):
        # Try appendix first (higher priority — check before numeric section RE)
        ap = parse_appendix_line(line.strip())
        if ap:
            # Appendix headers are only valid after TOC pages
            if page_no < TOC_PAGE_THRESHOLD:
                continue
            stripped = line.strip()
            # Skip TOC entries: lines with trailing dots/bullets + page number
            # e.g. "부록 A 제목·····90"
            if TOC_TRAIL_RE.search(stripped):
                continue
            # Deduplicate: same sec_no appearing twice
            if ap["sec_no"] in seen_appendix_secnos:
                continue
            seen_appendix_secnos.add(ap["sec_no"])
            header_positions.append({
                "idx": global_idx,
                "page_no": page_no,
                "type": "appendix",
                "sec_no": ap["sec_no"],
                "title": ap["title"],
                "kind": ap["kind"],
                "appendix_id": ap["appendix_id"],
            })
            continue

        # Try numeric section
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

        # Fix D: if this line is inside an appendix region (after first appendix header),
        # the numeric section-like pattern may be sub-sections of the appendix.
        # We still record it as a section — tree builder will handle positioning.
        header_positions.append({
            "idx": global_idx,
            "page_no": page_no,
            "type": "section",
            "sec_no": sec_no,
            "title": title,
            "level": level,
        })

    if not header_positions:
        print("[WARNING] No section or appendix headers detected!", file=sys.stderr)
        return [], [], toc_artifact_positions

    n_sections = sum(1 for h in header_positions if h["type"] == "section")
    n_appendix = sum(1 for h in header_positions if h["type"] == "appendix")
    print(
        f"[parse] Detected {n_sections} section headers + {n_appendix} appendix headers "
        f"(skipped {len(toc_artifact_positions)} artifacts)",
        file=sys.stderr,
    )

    # --- Second pass: extract body text for each header ---
    sections: List[Dict] = []
    appendix_sections: List[Dict] = []

    for i, hdr in enumerate(header_positions):
        body_lines = []
        start = hdr["idx"] + 1
        end = header_positions[i + 1]["idx"] if i + 1 < len(header_positions) else len(all_lines)

        for j in range(start, end):
            _, _, body_line = all_lines[j]
            body_lines.append(body_line)

        body = "\n".join(body_lines).strip()

        page_start = hdr["page_no"]
        page_end = all_lines[end - 1][0] if end > start else hdr["page_no"]

        if hdr["type"] == "section":
            level = hdr["level"]
            # A parent header at ANY level whose own line carries no text is an
            # umbrella: its content lives in deeper-level children. (Previously
            # this only flagged level <= 2, leaving 219 L3+ parents mis-marked
            # as orphaned empty bodies.)
            has_deeper_child = any(
                h["type"] == "section"
                and h["sec_no"].startswith(hdr["sec_no"] + ".")
                for h in header_positions
            )
            is_umbrella = (len(body) == 0) and (level <= 2 or has_deeper_child)
            section = {
                "sec_no": hdr["sec_no"],
                "title": hdr["title"],
                "level": level,
                "page_start": page_start,
                "page_end": page_end,
                "body": body,
            }
            if is_umbrella:
                section["is_umbrella"] = True
            sections.append(section)
        else:
            # Appendix entry
            appendix_entry = {
                "sec_no": hdr["sec_no"],
                "title": hdr["title"],
                "level": 2,
                "page_start": page_start,
                "page_end": page_end,
                "body": body,
                "is_appendix": True,
                "appendix_kind": hdr["kind"],
                "appendix_no": hdr["appendix_id"],
            }
            appendix_sections.append(appendix_entry)

    return sections, appendix_sections, toc_artifact_positions


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

    sections, appendix_sections, toc_artifacts = parse_sections(pages)

    depth_dist: Dict[int, int] = {}
    for s in sections:
        depth_dist[s["level"]] = depth_dist.get(s["level"], 0) + 1

    # Fix C: umbrella sections are valid; only flag non-umbrella empty-body as orphaned
    umbrella_sections = [s for s in sections if s.get("is_umbrella")]
    orphaned = [s for s in sections if not s["body"].strip() and not s.get("is_umbrella")]
    low_confidence = [s for s in sections if 0 < len(s["body"]) < 20]

    print(f"[stats] sections={len(sections)}, appendix={len(appendix_sections)}, depth_dist={depth_dist}", file=sys.stderr)
    print(f"[stats] umbrella={len(umbrella_sections)}, orphaned (non-umbrella, no body)={len(orphaned)}, low_confidence (body<20)={len(low_confidence)}", file=sys.stderr)
    print(f"[stats] toc_artifacts_skipped={len(toc_artifacts)}", file=sys.stderr)

    output = {
        "code": code,
        "title": title_candidate or "(unknown)",
        "version_date": version_date,
        "page_count": len(pages),
        "section_count": len(sections),
        "appendix_count": len(appendix_sections),
        "depth_distribution": depth_dist,
        "umbrella_count": len(umbrella_sections),
        "orphaned_count": len(orphaned),
        "low_confidence_count": len(low_confidence),
        "toc_artifacts_skipped": len(toc_artifacts),
        "sections": sections,
        "appendix_sections": appendix_sections,
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
    print(f"  appendix_sections: {len(appendix_sections)}")
    print(f"  depth_distribution: {depth_dist}")
    print(f"  umbrella_sections: {len(umbrella_sections)}")
    print(f"  orphaned_sections (non-umbrella, no body): {len(orphaned)}")
    print(f"  low_confidence: {len(low_confidence)}")
    print(f"  toc_artifacts_skipped: {len(toc_artifacts)}")

    if appendix_sections:
        print("\n--- Appendix sections ---")
        for ap in appendix_sections:
            print(f"  [{ap['sec_no']}] {ap['appendix_kind']} p{ap['page_start']}-{ap['page_end']} \"{ap['title'][:50]}\" body={len(ap['body'])} chars")

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
