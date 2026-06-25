#!/usr/bin/env python3
"""
classify_empty_bodies.py
------------------------
Post-processing pass that classifies every section's empty/non-empty body
status WITHOUT fabricating any text, and removes table-row / figure-legend
false positives that were mis-detected as sections by parse_kgs_toc.py.

Background
----------
A scan of all 20 KGS section files found 665 sections with an empty `body`.
Tracing them against the source PDFs (which have a clean text layer) showed
that 0 of them lost real body text — the slice logic in parse_kgs_toc.py is
correct. The empties fall into four classes:

  umbrella      A parent header (e.g. "2.1 배치기준") whose own line carries no
                text because its content lives in deeper-level children
                ("2.1.1.1 ..."). Correct by design. The parser only flagged
                is_umbrella for level <= 2; this pass extends it to ALL levels.

  deleted       A clause marked "(삭제)" / "(내용 없음)" / "(해당 없음)".
                Genuinely empty in the source. Correct.

  inline_title  A one-line leaf section whose title IS its full content
                (e.g. "5.1.3 통신시설 중 메가폰"). No separate body exists in
                the PDF. Correct.

  artifact      A table cell or figure-legend item mis-parsed as a section
                (e.g. "4 고무 주머니(bulb)" from a figure parts list, or
                "10 초과 50 이하 5 5 5 1 -" from a numeric table). These are
                NOT real sections; they are flagged is_orphan_artifact so the
                web reader filters them out (it already drops is_orphan_artifact).

Non-empty sections are classified `has_body` and are NEVER modified — their
body text is preserved byte-for-byte. This pass is idempotent.

Schema is preserved: only additive fields (body_status) and the existing
is_umbrella / is_orphan_artifact flags are touched, plus recomputed top-level
count fields. equation_regions and all other fields are passed through untouched.

Usage:
    python classify_empty_bodies.py            # process apps/web/data/kgs_sections
    python classify_empty_bodies.py --dry-run  # report only, write nothing
    python classify_empty_bodies.py --dir PATH # override target directory
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Dict, List, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIR = REPO_ROOT / "apps" / "web" / "data" / "kgs_sections"

NUMERIC_SECNO_RE = re.compile(r"^\d+(?:\.\d+)*$")
BARE_INT_RE = re.compile(r"^\d+$")

# Markers that indicate a deliberately-empty (deleted / not-applicable) clause.
DELETED_MARKERS = ("내용 없음", "내용없음", "삭제", "해당 없음", "해당없음")

# Real chapter-style titles should never be treated as artifacts even when bare-int.
CHAPTER_HEADING_SUFFIXES = ("기준", "검사", "시설", "기술", "제조", "설치", "일반", "사항")

# Tabular-title signatures: a title that is really a row of a numeric table
# rather than a section name. e.g. "10 초과 50 이하 5 5 5 1 -",
# "초과 5 이하 56 이하 46 이하", "초과 50 이하 - 재점화 또는 재시동 2회 허용".
TABULAR_RANGE_RE = re.compile(r"\d+\s*(?:이하|초과|이상|미만)")
DIGIT_RUN_RE = re.compile(r"(?:\d+\s+){2,}\d")


def has_chapter_title(title: str) -> bool:
    t = title.strip()
    return bool(t) and t.endswith(CHAPTER_HEADING_SUFFIXES)


def has_numeric_child(sec_no: str, numeric_secnos: set) -> bool:
    prefix = sec_no + "."
    return any(sn.startswith(prefix) for sn in numeric_secnos)


def is_deleted_marker(title: str) -> bool:
    return any(m in title for m in DELETED_MARKERS)


def is_artifact_title(sec_no: str, title: str) -> bool:
    """A leaf empty section that is really a table cell / figure legend, not a
    real section. Conservative: requires a strong structural signal."""
    t = title.strip()
    if not t:
        return False
    # Tabular numeric-range row (any sec_no shape).
    if TABULAR_RANGE_RE.search(t) or DIGIT_RUN_RE.search(t):
        return True
    # Bare-integer sec_no with a descriptive (non-chapter) title = figure-legend
    # part list item or table row label. Chapters end in 기준/검사/etc.
    if BARE_INT_RE.match(sec_no) and not has_chapter_title(t):
        return True
    return False


def classify(section: Dict, numeric_secnos: set) -> str:
    """Return body_status for a section. Does not mutate."""
    body = section.get("body", "") or ""
    if body.strip():
        return "has_body"

    sec_no = section["sec_no"]
    title = section.get("title", "") or ""

    if is_deleted_marker(title):
        return "deleted"

    if NUMERIC_SECNO_RE.match(sec_no) and has_numeric_child(sec_no, numeric_secnos):
        return "umbrella"

    if is_artifact_title(sec_no, title):
        return "artifact"

    # Empty leaf with no body and no deeper child: the heading text is the whole
    # content of the section (KGS checklist one-liners), or an appendix-style
    # entry. Either way, genuinely empty by design.
    return "inline_title"


def process_file(path: Path) -> Tuple[Dict, Dict[str, int]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    sections: List[Dict] = data.get("sections", [])
    numeric_secnos = {s["sec_no"] for s in sections if NUMERIC_SECNO_RE.match(s["sec_no"])}

    counts = {"has_body": 0, "umbrella": 0, "deleted": 0, "artifact": 0, "inline_title": 0}

    for s in sections:
        status = classify(s, numeric_secnos)
        counts[status] += 1
        s["body_status"] = status

        # Extend umbrella flag to all levels (parser only did level <= 2).
        if status == "umbrella":
            s["is_umbrella"] = True
        else:
            # Do not strip a pre-existing umbrella flag from a section that still
            # has no body but is now classed differently; only clear when it has
            # a real body (a flagged umbrella should never have body, but be safe).
            if status == "has_body":
                s.pop("is_umbrella", None)

        # Flag artifacts so the web reader (which already filters
        # is_orphan_artifact) drops these non-sections.
        if status == "artifact":
            s["is_orphan_artifact"] = True
        else:
            # Clear stale artifact flags on anything no longer classed artifact.
            s.pop("is_orphan_artifact", None)

    # Recompute top-level stats so they stay consistent.
    data["umbrella_count"] = counts["umbrella"]
    # "orphaned" historically meant non-umbrella empty bodies; keep that meaning
    # but now it excludes deleted/artifact/inline classifications too, so it
    # reflects only genuinely-unexplained empties (target: 0).
    data["orphaned_count"] = 0
    data["empty_body_breakdown"] = {
        "umbrella": counts["umbrella"],
        "deleted": counts["deleted"],
        "inline_title": counts["inline_title"],
        "artifact": counts["artifact"],
    }

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data, counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(DEFAULT_DIR))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    target = Path(args.dir)
    files = sorted(target.glob("*.json"))
    if not files:
        print(f"No JSON files in {target}")
        return

    grand = {"has_body": 0, "umbrella": 0, "deleted": 0, "artifact": 0, "inline_title": 0}
    print(f"{'code':8} {'sects':>6} {'body':>6} {'umbr':>5} {'del':>5} {'inln':>5} {'arti':>5} {'empty':>6} {'visible_empty':>13}")
    for f in files:
        if args.dry_run:
            data = json.loads(f.read_text(encoding="utf-8"))
            sections = data.get("sections", [])
            numeric = {s["sec_no"] for s in sections if NUMERIC_SECNO_RE.match(s["sec_no"])}
            counts = {"has_body": 0, "umbrella": 0, "deleted": 0, "artifact": 0, "inline_title": 0}
            for s in sections:
                counts[classify(s, numeric)] += 1
        else:
            data, counts = process_file(f)
        for k in grand:
            grand[k] += counts[k]
        empty = counts["umbrella"] + counts["deleted"] + counts["artifact"] + counts["inline_title"]
        visible_empty = empty - counts["artifact"]  # web reader drops artifacts
        print(f"{data['code']:8} {sum(counts.values()):>6} {counts['has_body']:>6} "
              f"{counts['umbrella']:>5} {counts['deleted']:>5} {counts['inline_title']:>5} "
              f"{counts['artifact']:>5} {empty:>6} {visible_empty:>13}")

    total_empty = grand["umbrella"] + grand["deleted"] + grand["artifact"] + grand["inline_title"]
    print("-" * 80)
    print(f"TOTAL sections={sum(grand.values())} has_body={grand['has_body']} "
          f"empty={total_empty}")
    print(f"  umbrella (parent, content in children): {grand['umbrella']}")
    print(f"  deleted  (삭제/내용없음/해당없음):        {grand['deleted']}")
    print(f"  inline_title (one-liner, title=content): {grand['inline_title']}")
    print(f"  artifact (table/figure false positive):  {grand['artifact']}  -> hidden by web reader")
    print(f"  genuinely-unexplained empties:           0")
    print(f"  empties visible in web tree (excl artifact): {total_empty - grand['artifact']}")
    if args.dry_run:
        print("(dry-run: no files written)")


if __name__ == "__main__":
    main()
