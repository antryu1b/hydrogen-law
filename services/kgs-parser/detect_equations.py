#!/usr/bin/env python3
"""
detect_equations.py
-------------------
Scan KGS PDFs for equation/formula regions, then augment each section JSON
with an `equation_regions` array.

Heuristics (any word on a page triggers equation scanning):
  - Contains unit symbols: ㎫ ㎟ ㎜ N/m kg/m N/㎟ kN/m kgf
  - Contains math operators/symbols: = ≥ ≤ ≈ √ ∫ ∑ σ τ μ λ π
  - Contains formula numbering like (2. (3. (4. at start of isolated token
  - Small font size (< 7 pt) indicating sub/superscript
  - Lines with patterns: Ra = Qt, R = qA, etc.

Cluster logic:
  - Group words vertically within 30 pt into a region
  - Pad each region: left-10, right+10, top-5, bottom+5
  - Attach to section whose page_start <= page <= page_end
"""

import json
import glob
import os
import re
import sys
from pathlib import Path

import pdfplumber

# Paths
REPO_ROOT = Path(__file__).parent.parent.parent
PDF_DIR = REPO_ROOT / "apps/web/data/kgs_pdfs"
SECTIONS_DIR = REPO_ROOT / "apps/web/data/kgs_sections"

# Heuristics — characters/patterns that indicate a formula word
MATH_CHARS = set("=≥≤≈√∫∑σταμλπρφψωΩΔ")
UNIT_PATTERNS = re.compile(r"㎫|㎟|㎜|㎝|㎞|N/㎟|kN|kgf|N/m|kg/m|N/cm|MPa|kPa|GPa")
FORMULA_NUM_PATTERN = re.compile(r"^\(\d+[.\d]*\)$")  # e.g. (2.1) (3)
MATH_TOKEN_PATTERN = re.compile(r"^[=+\-*/^()[\]{}<>≥≤≈∑∫√]+$")
SPECIAL_UNITS = re.compile(r"[㎫㎟㎜㎝㎞]")

SMALL_FONT_THRESHOLD = 7.0  # pt — sub/superscript
CLUSTER_VERTICAL_GAP = 35.0  # pt — max gap to merge two rows into one region
PAD_LEFT = 10.0
PAD_RIGHT = 10.0
PAD_TOP = 6.0
PAD_BOTTOM = 6.0


def is_math_word(word: dict) -> bool:
    text = word["text"]
    size = word.get("size", 10.0)

    if size < SMALL_FONT_THRESHOLD:
        return True
    if UNIT_PATTERNS.search(text):
        return True
    if SPECIAL_UNITS.search(text):
        return True
    if FORMULA_NUM_PATTERN.match(text):
        return True
    if MATH_TOKEN_PATTERN.match(text):
        return True
    if any(c in MATH_CHARS for c in text):
        return True
    return False


def cluster_words(math_words: list) -> list:
    """Group math words into equation regions by vertical proximity."""
    if not math_words:
        return []

    # Sort by top position
    sorted_words = sorted(math_words, key=lambda w: w["top"])

    regions = []
    current = list(sorted_words[:1])

    for word in sorted_words[1:]:
        # If close vertically to current cluster, expand it
        if word["top"] - current[-1]["bottom"] <= CLUSTER_VERTICAL_GAP:
            current.append(word)
        else:
            regions.append(current)
            current = [word]
    regions.append(current)

    # Convert each cluster to a bbox
    result = []
    for cluster in regions:
        x0 = min(w["x0"] for w in cluster)
        x1 = max(w["x1"] for w in cluster)
        top = min(w["top"] for w in cluster)
        bottom = max(w["bottom"] for w in cluster)

        # Apply padding, clamped to page bounds (assuming 595×841 A4)
        bbox = [
            max(0.0, x0 - PAD_LEFT),
            max(0.0, top - PAD_TOP),
            min(595.0, x1 + PAD_RIGHT),
            min(841.0, bottom + PAD_BOTTOM),
        ]
        result.append(bbox)

    return result


def find_equation_regions_in_pdf(pdf_path: Path) -> dict:
    """
    Returns: {page_number (1-based): [bbox, ...], ...}
    Only pages with detected equation regions are included.
    """
    page_regions = {}

    with pdfplumber.open(str(pdf_path)) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            page_num = page_idx + 1
            try:
                words = page.extract_words(extra_attrs=["size"])
            except Exception:
                continue

            math_words = [w for w in words if is_math_word(w)]
            if not math_words:
                continue

            # Filter out isolated =, N, numbers that appear in running text
            # Keep only if there are 2+ math words within vertical proximity
            # (to avoid flagging every body paragraph that mentions "= 1.5배")
            clusters_raw = cluster_words(math_words)

            # Only keep clusters where either:
            #   (a) the cluster spans multiple rows (height > 15pt), or
            #   (b) the cluster has a unit symbol word, or
            #   (c) cluster has 3+ words
            filtered_clusters = []
            for cluster_words_raw in _split_raw_clusters(math_words):
                height = max(w["bottom"] for w in cluster_words_raw) - min(w["top"] for w in cluster_words_raw)
                has_unit = any(UNIT_PATTERNS.search(w["text"]) or SPECIAL_UNITS.search(w["text"]) for w in cluster_words_raw)
                has_math_op = any(MATH_TOKEN_PATTERN.match(w["text"]) for w in cluster_words_raw)
                if (has_unit and has_math_op) or len(cluster_words_raw) >= 3 or height > 15.0:
                    filtered_clusters.append(cluster_words_raw)

            if not filtered_clusters:
                continue

            bboxes = []
            for cluster in filtered_clusters:
                x0 = min(w["x0"] for w in cluster)
                x1 = max(w["x1"] for w in cluster)
                top = min(w["top"] for w in cluster)
                bottom = max(w["bottom"] for w in cluster)
                bbox = [
                    round(max(0.0, x0 - PAD_LEFT), 1),
                    round(max(0.0, top - PAD_TOP), 1),
                    round(min(page.width, x1 + PAD_RIGHT), 1),
                    round(min(page.height, bottom + PAD_BOTTOM), 1),
                ]
                bboxes.append(bbox)

            if bboxes:
                page_regions[page_num] = bboxes

    return page_regions


def _split_raw_clusters(math_words: list) -> list:
    """Re-cluster by vertical gap (same logic as cluster_words but returns word lists)."""
    if not math_words:
        return []
    sorted_words = sorted(math_words, key=lambda w: w["top"])
    clusters = []
    current = [sorted_words[0]]
    for word in sorted_words[1:]:
        if word["top"] - current[-1]["bottom"] <= CLUSTER_VERTICAL_GAP:
            current.append(word)
        else:
            clusters.append(current)
            current = [word]
    clusters.append(current)
    return clusters


def augment_sections(code: str, page_regions: dict) -> dict:
    """
    Load existing section JSON for code, add equation_regions to matching sections,
    return updated data dict.
    """
    json_path = SECTIONS_DIR / f"{code}.json"
    if not json_path.exists():
        print(f"  [WARN] sections file not found: {json_path}")
        return {}

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    sections = data.get("sections", [])
    augmented = 0

    for section in sections:
        page_start = section.get("page_start")
        page_end = section.get("page_end")
        if page_start is None or page_end is None:
            continue

        eq_regions = []
        eq_id_counter = 1
        for page_num, bboxes in sorted(page_regions.items()):
            if page_start <= page_num <= page_end:
                for bbox in bboxes:
                    sec_slug = section["sec_no"].replace(".", "_")
                    eq_regions.append({
                        "page": page_num,
                        "bbox": bbox,
                        "id": f"eq_{sec_slug}_{eq_id_counter}",
                    })
                    eq_id_counter += 1

        if eq_regions:
            section["equation_regions"] = eq_regions
            augmented += 1
        else:
            # Remove any stale equation_regions from previous runs
            section.pop("equation_regions", None)

    return data, augmented


def main():
    pdf_files = sorted(PDF_DIR.glob("*.pdf"))
    if not pdf_files:
        print(f"No PDFs found in {PDF_DIR}")
        sys.exit(1)

    print(f"Found {len(pdf_files)} PDFs in {PDF_DIR}")
    total_sections_with_eq = 0
    total_sections = 0

    for pdf_path in pdf_files:
        # Derive code from filename: e.g. "FP217-260508.pdf" -> "FP217"
        stem = pdf_path.stem  # e.g. "FP217-260508"
        code = stem.split("-")[0].split("_")[0]

        json_path = SECTIONS_DIR / f"{code}.json"
        if not json_path.exists():
            print(f"  [SKIP] No sections JSON for {code} ({pdf_path.name})")
            continue

        print(f"\nProcessing {code} ({pdf_path.name})...", flush=True)

        page_regions = find_equation_regions_in_pdf(pdf_path)
        print(f"  Equation regions on {len(page_regions)} pages", flush=True)

        result = augment_sections(code, page_regions)
        if not result:
            continue
        data, augmented = result

        sections = data.get("sections", [])
        total_sections += len(sections)
        total_sections_with_eq += augmented

        print(f"  Augmented {augmented}/{len(sections)} sections with equation_regions")

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  Saved {json_path.name}")

    print(f"\nDone. Total: {total_sections_with_eq} / {total_sections} sections have equation_regions")


if __name__ == "__main__":
    main()
