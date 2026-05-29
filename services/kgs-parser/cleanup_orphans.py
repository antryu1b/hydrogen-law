#!/usr/bin/env python3
"""
cleanup_orphans.py
------------------
Identify and flag body-text artifact sections that appear as orphan tree roots.

Two classes of orphan artifacts:

CLASS A — Bare integer sec_no (no dot):
  e.g. sec_no="6", "9", "12", "1", "2"
  These are table-cell fragments where the cell's row label (a number) was
  mistakenly parsed as a section number.
  Criteria (ALL must hold):
    - sec_no is a bare integer (no dot)
    - NOT in standard KGS top-level chapters (these are never bare-int: chapters
      are labelled like "1", "2", "3", "4" but only when they have children)
    - Has NO children in the section list
    - Title looks like a table cell (contains a number + suffix, or Korean text
      that is not a chapter-level heading)

  Since this is ambiguous (legitimate chapters CAN be bare integers), we use
  a STRICT guard: bare integer is an artifact only if it has NO children AND
  its title does NOT end in "기준" or "검사" (typical chapter headings).

CLASS B — Dotted sec_no with no parent AND no children AND tiny body:
  e.g. sec_no="5.1", "5.2" (FP216/FP217) where the parent "5" does not exist
  and the entry itself has no children and body < 50 chars.
  These are isolated table-row items that landed at section level.
  Criteria (ALL must hold):
    - sec_no contains a dot
    - No ancestor sec_no exists in the data
    - Has NO children
    - body_chars < 50

IMPORTANT: We NEVER flag sections that have children, regardless of other
criteria. A section with children is a real section header (even if the parser
missed the parent chapter).

Sections flagged: is_orphan_artifact = true
Tree builder will skip these.
"""

import json
import glob
import re
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
SECTIONS_DIR = REPO_ROOT / "apps/web/data/kgs_sections"

CHAPTER_HEADING_SUFFIXES = ("기준", "검사", "시설", "기술", "제조", "설치", "일반")

BARE_INT_RE = re.compile(r"^\d+$")


def has_chapter_title(title: str) -> bool:
    """Returns True if the title looks like a real chapter heading."""
    if not title:
        return False
    for suffix in CHAPTER_HEADING_SUFFIXES:
        if title.endswith(suffix):
            return True
    return False


def get_children(sec_no: str, sec_nos: set) -> list:
    """Return list of sec_nos that are direct or indirect children."""
    prefix = sec_no + "."
    return [sn for sn in sec_nos if sn.startswith(prefix)]


def has_ancestor(sec_no: str, sec_nos: set) -> bool:
    """Return True if any ancestor sec_no exists in the data."""
    if "." not in sec_no:
        return False
    parts = sec_no.split(".")
    for i in range(len(parts) - 1, 0, -1):
        candidate = ".".join(parts[:i])
        if candidate in sec_nos:
            return True
    return False


def classify_section(s: dict, sec_nos: set) -> str:
    """
    Returns 'artifact', 'legit', or 'normal'.
    """
    sn = s["sec_no"]
    body = s.get("body_chars", len(s.get("body", "")))
    title = s.get("title", "")
    children = get_children(sn, sec_nos)

    # Never flag sections with children
    if children:
        return "normal"

    # CLASS A: bare integer
    if BARE_INT_RE.match(sn):
        # Is it a genuine chapter (has children)? Already handled above.
        # If no children and not a chapter-title-suffix, flag it
        if not has_chapter_title(title):
            return "artifact"
        return "normal"

    # CLASS B: dotted sec_no, no ancestor, no children, tiny body
    if "." in sn and not has_ancestor(sn, sec_nos):
        if body < 50:
            return "artifact"
        return "legit"  # Has content but missing parent — real section, keep

    return "normal"


def process_file(json_path: Path) -> dict:
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    sections = data.get("sections", [])
    sec_nos = {s["sec_no"] for s in sections}

    artifacts = []
    legit_orphans = []

    for s in sections:
        cls = classify_section(s, sec_nos)
        if cls == "artifact":
            s["is_orphan_artifact"] = True
            artifacts.append(s["sec_no"])
        else:
            # Clear any previous stale flag
            s.pop("is_orphan_artifact", None)
            if cls == "legit":
                legit_orphans.append(s["sec_no"])

    return data, artifacts, legit_orphans


def main():
    json_files = sorted(SECTIONS_DIR.glob("*.json"))
    if not json_files:
        print(f"No JSON files found in {SECTIONS_DIR}")
        return

    print(f"Processing {len(json_files)} section files...\n")
    grand_total_artifacts = 0

    for json_path in json_files:
        data, artifacts, legit_orphans = process_file(json_path)
        code = data.get("code", json_path.stem)

        if artifacts or legit_orphans:
            print(f"{code}:")
            if artifacts:
                print(f"  Flagged as artifacts ({len(artifacts)}): {artifacts}")
                grand_total_artifacts += len(artifacts)
            if legit_orphans:
                print(f"  Legit orphans - content exists, parent missing ({len(legit_orphans)}): {legit_orphans}")

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\nDone. Total artifacts flagged: {grand_total_artifacts}")
    print("All JSON files saved.")


if __name__ == "__main__":
    main()
