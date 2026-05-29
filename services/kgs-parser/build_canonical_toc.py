#!/usr/bin/env python3
"""
Phase 2: Build canonical TOC per family with exact + fuzzy section matching.
Output: data/kgs-canonical-toc.json
        docs/kgs-canonical-toc-mapping-2026-05-28.md
"""
import json
import os
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

BASE = "/Users/andrew/PRJs/hydrogen-law"
SEC_DIR = os.path.join(BASE, "data", "kgs_sections")
FAMILIES_FILE = os.path.join(BASE, "data", "kgs_families.json")
CODES_FILE = os.path.join(BASE, "data", "kgs-codes-current.json")
OUT_JSON = os.path.join(BASE, "data", "kgs-canonical-toc.json")
OUT_MD = os.path.join(BASE, "docs", "kgs-canonical-toc-mapping-2026-05-28.md")

EXACT_THRESHOLD = 1.0   # exact title match considered 1.0
FUZZY_THRESHOLD = 0.7   # TF-IDF cosine similarity threshold for fuzzy match


# ─────────────────────────────────────────
# Load all data
# ─────────────────────────────────────────

def load_families():
    return json.load(open(FAMILIES_FILE, encoding="utf-8"))

def load_codes_map():
    """Returns {code: name_korean}"""
    raw = json.load(open(CODES_FILE, encoding="utf-8"))
    return {c["code"]: c["name"] for c in raw["codes"]}

def load_code_sections():
    """Returns {code: [section_dict, ...]}"""
    result = {}
    for fname in os.listdir(SEC_DIR):
        if not fname.endswith(".json"):
            continue
        code = fname.replace(".json", "")
        data = json.load(open(os.path.join(SEC_DIR, fname), encoding="utf-8"))
        result[code] = data.get("sections", [])
    return result


# ─────────────────────────────────────────
# Matching helpers
# ─────────────────────────────────────────

def sections_by_secno(sections):
    """Dict: sec_no -> section dict"""
    return {s["sec_no"]: s for s in sections}

def sections_by_title(sections):
    """Dict: normalized_title -> [section dict, ...]"""
    d = {}
    for s in sections:
        key = normalize_title(s.get("title", ""))
        d.setdefault(key, []).append(s)
    return d

def normalize_title(title):
    """Strip spaces / parens suffixes for matching"""
    t = title.strip()
    # Remove trailing parenthetical annotations like "(해당 없음)", "(내용 없음)"
    if "(" in t:
        t = t[:t.index("(")].strip()
    # Collapse whitespace
    t = " ".join(t.split())
    return t

def jaccard_char(a, b):
    """Character-level Jaccard similarity"""
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 1.0
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)

def tfidf_match(query_title, candidate_sections, threshold=FUZZY_THRESHOLD):
    """
    Find best TF-IDF match among candidate_sections for query_title.
    Returns (best_section, score) or (None, 0.0) if below threshold.
    """
    if not candidate_sections:
        return None, 0.0

    candidates = [normalize_title(s.get("title", "")) for s in candidate_sections]
    query_norm = normalize_title(query_title)

    # Need at least 2 docs for TF-IDF; pad if needed
    all_docs = [query_norm] + candidates
    if len(all_docs) < 2:
        return None, 0.0

    try:
        vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 3), min_df=1)
        mat = vec.fit_transform(all_docs)
        # cosine similarity of query (row 0) vs all candidates
        sims = cosine_similarity(mat[0:1], mat[1:]).flatten()
    except Exception:
        # Fallback to Jaccard char if TF-IDF fails
        sims = [jaccard_char(query_norm, c) for c in candidates]

    best_idx = int(sims.argmax())
    best_score = float(sims[best_idx])

    if best_score >= threshold:
        return candidate_sections[best_idx], best_score
    return None, 0.0


# ─────────────────────────────────────────
# Build canonical TOC entry for a family
# ─────────────────────────────────────────

def build_family_canonical_toc(canonical_secnos, canonical_titles, members, all_sections):
    """
    For each canonical sec_no, check every member code for exact/fuzzy match.
    Returns list of canonical_toc entries.
    """
    toc_entries = []

    for sec_no in canonical_secnos:
        canonical_title = canonical_titles.get(sec_no, "")
        level = len(sec_no.split("."))  # e.g. "2.1" -> 2; "3" -> 1

        codes_dict = {}
        for code in members:
            secs = all_sections.get(code, [])
            by_secno = sections_by_secno(secs)

            # 1. Exact sec_no match
            if sec_no in by_secno:
                s = by_secno[sec_no]
                codes_dict[code] = {
                    "present": True,
                    "matched_sec_no": sec_no,
                    "matched_title": s.get("title", ""),
                    "body_chars": len(s.get("body", "")),
                    "is_umbrella": s.get("is_umbrella", False),
                }
                continue

            # 2. Title-based exact match (different sec_no, same normalized title)
            norm_canonical = normalize_title(canonical_title)
            found_title_match = None
            for s in secs:
                if normalize_title(s.get("title", "")) == norm_canonical and norm_canonical:
                    found_title_match = s
                    break

            if found_title_match:
                codes_dict[code] = {
                    "present": True,
                    "matched_sec_no": found_title_match["sec_no"],
                    "matched_title": found_title_match.get("title", ""),
                    "body_chars": len(found_title_match.get("body", "")),
                    "is_umbrella": found_title_match.get("is_umbrella", False),
                    "match_method": "title_exact",
                }
                continue

            # 3. TF-IDF fuzzy match
            best_s, score = tfidf_match(canonical_title, secs)
            if best_s is not None:
                codes_dict[code] = {
                    "present": "fuzzy",
                    "matched_sec_no": best_s["sec_no"],
                    "matched_title": best_s.get("title", ""),
                    "body_chars": len(best_s.get("body", "")),
                    "is_umbrella": best_s.get("is_umbrella", False),
                    "match_score": round(score, 4),
                }
                continue

            # 4. Absent
            codes_dict[code] = {"present": False}

        toc_entries.append({
            "sec_no": sec_no,
            "title": canonical_title,
            "level": level,
            "codes": codes_dict,
        })

    return toc_entries


# ─────────────────────────────────────────
# Build outlier canonical TOC (from their own L2 sec_nos)
# ─────────────────────────────────────────

def build_outlier_canonical_toc(code, secs):
    """
    For outlier codes (AC116, AC414), build canonical TOC from their own L2 sec_nos.
    Returns list of canonical_toc entries (single-member family).
    """
    toc_entries = []
    l2_secs = [s for s in secs if s.get("level", 0) <= 2 and s.get("level", 0) >= 1]
    # Deduplicate by sec_no
    seen = set()
    for s in l2_secs:
        sn = s["sec_no"]
        if sn in seen:
            continue
        seen.add(sn)
        level = len(sn.split("."))
        toc_entries.append({
            "sec_no": sn,
            "title": s.get("title", ""),
            "level": level,
            "codes": {
                code: {
                    "present": True,
                    "matched_sec_no": sn,
                    "matched_title": s.get("title", ""),
                    "body_chars": len(s.get("body", "")),
                    "is_umbrella": s.get("is_umbrella", False),
                }
            },
        })
    return toc_entries


# ─────────────────────────────────────────
# Universal sections (cross-family)
# ─────────────────────────────────────────

def build_universal(families_data, all_toc_by_family, all_sections, all_members):
    """
    sec_nos from cross_family_shared_sec_nos that appear in 2+ families.
    Note: same sec_no may have DIFFERENT titles across families (e.g. 4.1 검사종류 vs 검사항목).
    Records title_per_family so Phase 3 UX can show the right title per code.
    Returns list of universal entries.
    """
    cross_secnos = families_data.get("cross_family_shared_sec_nos", [])

    universal = []
    for sec_no in cross_secnos:
        # Gather title candidates from families
        title_candidates = {}
        for fam in families_data["families"]:
            shared_titles = fam.get("shared_titles", {})
            if sec_no in shared_titles:
                title_candidates[fam["id"]] = shared_titles[sec_no]

        if len(title_candidates) < 2:
            continue

        # Check if titles differ across families — flag the discrepancy
        unique_titles = list(dict.fromkeys(title_candidates.values()))
        canonical_title = unique_titles[0]
        title_variant = len(unique_titles) > 1  # True = title differs by family
        applies_to = list(title_candidates.keys())

        # Build codes dict for ALL members across all families
        codes_dict = {}
        all_member_codes = all_members  # all 18 A+B codes

        for code in all_member_codes:
            secs = all_sections.get(code, [])
            by_secno = sections_by_secno(secs)
            if sec_no in by_secno:
                s = by_secno[sec_no]
                codes_dict[code] = {
                    "present": True,
                    "matched_sec_no": sec_no,
                    "matched_title": s.get("title", ""),
                    "body_chars": len(s.get("body", "")),
                    "is_umbrella": s.get("is_umbrella", False),
                }
            else:
                # Try fuzzy
                best_s, score = tfidf_match(canonical_title, secs)
                if best_s is not None:
                    codes_dict[code] = {
                        "present": "fuzzy",
                        "matched_sec_no": best_s["sec_no"],
                        "matched_title": best_s.get("title", ""),
                        "body_chars": len(best_s.get("body", "")),
                        "match_score": round(score, 4),
                    }
                else:
                    codes_dict[code] = {"present": False}

        level = len(sec_no.split("."))
        entry = {
            "sec_no": sec_no,
            "title": canonical_title,
            "level": level,
            "applies_to_families": applies_to,
            "codes": codes_dict,
        }
        if title_variant:
            entry["title_per_family"] = title_candidates
            entry["title_variant_note"] = "same sec_no, different title by family — UX must use title_per_family per code"
        universal.append(entry)

    return universal


# ─────────────────────────────────────────
# Main build
# ─────────────────────────────────────────

def main():
    families_data = load_families()
    codes_map = load_codes_map()
    all_sections = load_code_sections()

    families_out = []
    all_toc_by_family = {}

    # Build A and B families
    for fam in families_data["families"]:
        fid = fam["id"]
        members = fam["members"]
        shared_secnos = fam.get("shared_sec_nos_l2", [])
        shared_titles = fam.get("shared_titles", {})

        print(f"Building family {fid}: {len(members)} members, {len(shared_secnos)} canonical sec_nos")

        canonical_toc = build_family_canonical_toc(
            canonical_secnos=shared_secnos,
            canonical_titles=shared_titles,
            members=members,
            all_sections=all_sections,
        )

        families_out.append({
            "id": fid,
            "label": fam["label"],
            "members": members,
            "canonical_toc": canonical_toc,
        })
        all_toc_by_family[fid] = canonical_toc

    # Build C family (outliers)
    outliers = families_data.get("outliers", [])
    c_toc = []
    for code in outliers:
        secs = all_sections.get(code, [])
        entries = build_outlier_canonical_toc(code, secs)
        # Merge: if same sec_no already in c_toc, add code to existing entry
        existing_secnos = {e["sec_no"]: e for e in c_toc}
        for entry in entries:
            sn = entry["sec_no"]
            if sn in existing_secnos:
                existing_secnos[sn]["codes"].update(entry["codes"])
            else:
                c_toc.append(entry)
                existing_secnos[sn] = entry

    families_out.append({
        "id": "C",
        "label": "재검사 그룹",
        "members": outliers,
        "canonical_toc": c_toc,
    })

    # Build universal sections
    all_ab_members = []
    for fam in families_data["families"]:
        all_ab_members.extend(fam["members"])

    universal = build_universal(
        families_data=families_data,
        all_toc_by_family=all_toc_by_family,
        all_sections=all_sections,
        all_members=all_ab_members,
    )
    print(f"Universal sections: {len(universal)}")

    # Assemble final output
    out = {
        "version": "2026-05-28-phase2",
        "families": families_out,
        "universal": universal,
    }

    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"Written: {OUT_JSON}")

    # Build markdown report
    build_markdown(out, families_data, codes_map)
    print(f"Written: {OUT_MD}")


# ─────────────────────────────────────────
# Markdown report
# ─────────────────────────────────────────

def count_stats(canonical_toc):
    """Returns (n_canonical, n_exact, n_fuzzy, n_missing, total_cells)"""
    n_canonical = len(canonical_toc)
    n_exact = 0
    n_fuzzy = 0
    n_missing = 0
    total_cells = 0
    for entry in canonical_toc:
        for code, info in entry["codes"].items():
            total_cells += 1
            p = info.get("present")
            if p is True:
                n_exact += 1
            elif p == "fuzzy":
                n_fuzzy += 1
            else:
                n_missing += 1
    return n_canonical, n_exact, n_fuzzy, n_missing, total_cells


def collect_fuzzy_matches(families_out):
    """Returns list of (canonical_sec_no, canonical_title, family_id, code, matched_sec_no, matched_title, score)"""
    fuzzy = []
    for fam in families_out:
        fid = fam["id"]
        for entry in fam["canonical_toc"]:
            sn = entry["sec_no"]
            title = entry["title"]
            for code, info in entry["codes"].items():
                if info.get("present") == "fuzzy":
                    fuzzy.append({
                        "family": fid,
                        "canonical_sec_no": sn,
                        "canonical_title": title,
                        "code": code,
                        "matched_sec_no": info.get("matched_sec_no", ""),
                        "matched_title": info.get("matched_title", ""),
                        "score": info.get("match_score", 0.0),
                    })
    fuzzy.sort(key=lambda x: x["score"])  # lowest confidence first
    return fuzzy


def collect_empty_body(families_out):
    """Returns list of (family_id, code, sec_no, title, body_chars)"""
    warnings = []
    for fam in families_out:
        fid = fam["id"]
        for entry in fam["canonical_toc"]:
            sn = entry["sec_no"]
            title = entry["title"]
            for code, info in entry["codes"].items():
                if info.get("present") is True and info.get("body_chars", 1) < 50:
                    warnings.append({
                        "family": fid,
                        "code": code,
                        "sec_no": sn,
                        "title": title,
                        "body_chars": info.get("body_chars", 0),
                        "is_umbrella": info.get("is_umbrella", False),
                    })
    return warnings


def family_table_rows(fam):
    """Returns list of row tuples for the family table"""
    rows = []
    for entry in fam["canonical_toc"]:
        sn = entry["sec_no"]
        title = entry["title"]
        codes = entry["codes"]
        n_members = len(fam["members"])
        n_present = sum(1 for c in codes.values() if c.get("present") is True)
        n_fuzzy = sum(1 for c in codes.values() if c.get("present") == "fuzzy")
        n_missing = sum(1 for c in codes.values() if not c.get("present"))

        fuzzy_notes = []
        for code, info in codes.items():
            if info.get("present") == "fuzzy":
                fuzzy_notes.append(f"{code}→{info.get('matched_sec_no','')}({info.get('match_score',0):.2f})")

        missing_codes = [code for code, info in codes.items() if not info.get("present")]

        rows.append((
            sn,
            title[:35] if len(title) > 35 else title,
            f"{n_present + n_fuzzy}/{n_members}",
            "; ".join(fuzzy_notes) if fuzzy_notes else "-",
            ", ".join(missing_codes) if missing_codes else "-",
        ))
    return rows


def build_markdown(out, families_data, codes_map):
    lines = []
    total_canonical = sum(len(f["canonical_toc"]) for f in out["families"])

    lines.append("# KGS CODE Canonical TOC Mapping — Phase 2")
    lines.append(f"Date: 2026-05-28")
    lines.append(f"Scope: 20 codes, {len(out['families'])} families, {total_canonical} total canonical sec_nos")
    lines.append("")

    all_fuzzy = collect_fuzzy_matches(out["families"])
    all_empty = collect_empty_body(out["families"])

    for fam in out["families"]:
        fid = fam["id"]
        members = fam["members"]
        n_canon, n_exact, n_fuzzy, n_missing, total_cells = count_stats(fam["canonical_toc"])

        lines.append(f"---")
        lines.append(f"")
        lines.append(f"## Family {fid} — {fam['label']} ({len(members)} codes)")
        lines.append(f"Canonical TOC: {n_canon} entries | {n_exact} exact + {n_fuzzy} fuzzy + {n_missing} missing across {total_cells} cells")
        lines.append("")
        lines.append(f"Member codes: {', '.join(members)}")
        lines.append("")

        # Table
        lines.append("| sec_no | title | present/total | fuzzy matches | missing |")
        lines.append("|--------|-------|--------------|---------------|---------|")
        for row in family_table_rows(fam):
            lines.append(f"| {row[0]} | {row[1]} | {row[2]} | {row[3]} | {row[4]} |")
        lines.append("")

    # Universal sections
    lines.append("---")
    lines.append("")
    lines.append("## Universal Sections (cross-family)")
    if out["universal"]:
        lines.append("")
        lines.append("| sec_no | title (A / B if different) | families | exact | fuzzy | missing |")
        lines.append("|--------|---------------------------|----------|-------|-------|---------|")
        for entry in out["universal"]:
            codes = entry["codes"]
            n_exact = sum(1 for c in codes.values() if c.get("present") is True)
            n_fuzzy = sum(1 for c in codes.values() if c.get("present") == "fuzzy")
            n_miss = sum(1 for c in codes.values() if not c.get("present"))
            fams = "+".join(entry.get("applies_to_families", []))
            if "title_per_family" in entry:
                tpf = entry["title_per_family"]
                title_cell = " / ".join(f"{fid}:{t[:20]}" for fid, t in tpf.items())
            else:
                title_cell = entry["title"][:40]
            lines.append(f"| {entry['sec_no']} | {title_cell} | {fams} | {n_exact} | {n_fuzzy} | {n_miss} |")
        lines.append("")
    else:
        lines.append("(none identified)")
        lines.append("")

    # Fuzzy matches needing review
    lines.append("---")
    lines.append("")
    lines.append("## Fuzzy Matches Needing Review")
    lines.append("")
    if all_fuzzy:
        lines.append("| family | canonical sec_no | canonical title | code | matched sec_no | matched title | score | accept? |")
        lines.append("|--------|-----------------|-----------------|------|----------------|---------------|-------|---------|")
        for m in all_fuzzy:
            lines.append(
                f"| {m['family']} | {m['canonical_sec_no']} | {m['canonical_title'][:30]} | "
                f"{m['code']} | {m['matched_sec_no']} | {m['matched_title'][:30]} | "
                f"{m['score']:.3f} | (Andrew checks) |"
            )
        lines.append("")
    else:
        lines.append("(no fuzzy matches — all sections matched exactly or absent)")
        lines.append("")

    # Empty body warnings
    lines.append("---")
    lines.append("")
    lines.append("## Empty Body Warnings (body_chars < 50)")
    lines.append("")
    lines.append("These are likely umbrella headers. UX should show '(상위 헤더, 본문 없음)':")
    lines.append("")
    if all_empty:
        lines.append("| family | code | sec_no | title | body_chars | is_umbrella |")
        lines.append("|--------|------|--------|-------|------------|-------------|")
        for w in all_empty:
            lines.append(
                f"| {w['family']} | {w['code']} | {w['sec_no']} | "
                f"{w['title'][:35]} | {w['body_chars']} | {w['is_umbrella']} |"
            )
        lines.append("")
    else:
        lines.append("(no empty body sections in canonical TOC)")
        lines.append("")

    os.makedirs(os.path.dirname(OUT_MD), exist_ok=True)
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


if __name__ == "__main__":
    main()
