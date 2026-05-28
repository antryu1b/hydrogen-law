#!/usr/bin/env python3
"""
cluster_families.py
Builds family map from parsed KGS section JSONs using Jaccard similarity on L1+L2 sec_nos.
Output: data/kgs_families.json
"""
import json
from pathlib import Path
from itertools import combinations
from collections import defaultdict

REPO = Path.home() / "Thairon/hydrogen-law-rag"
SECTIONS_DIR = REPO / "data/kgs_sections"
CURRENT_JSON = REPO / "data/kgs-codes-current.json"
OUTPUT_PATH = REPO / "data/kgs_families.json"

JACCARD_THRESHOLD = 0.6

# All 19 target codes (5 original + 14 new, FU671 excluded)
ALL_CODES = sorted([f.stem for f in SECTIONS_DIR.glob("*.json")])


def load_code_names():
    """Load code -> name mapping from current JSON."""
    with open(CURRENT_JSON) as f:
        data = json.load(f)
    return {e["code"]: e.get("name", "") for e in data["codes"]}


def extract_sec_nos(code):
    """Extract set of L1+L2 sec_nos from section JSON. Returns (set, title_map)."""
    path = SECTIONS_DIR / f"{code}.json"
    if not path.exists():
        return None, {}
    with open(path) as f:
        data = json.load(f)
    sec_nos = set()
    title_map = {}
    for s in data.get("sections", []):
        if s["level"] <= 2:
            sec_nos.add(s["sec_no"])
            title_map[s["sec_no"]] = s["title"]
    return sec_nos, title_map


def jaccard(a, b):
    if not a and not b:
        return 1.0
    union = a | b
    if not union:
        return 1.0
    return len(a & b) / len(union)


def cluster_codes(code_secnos):
    """Simple union-find clustering with Jaccard >= threshold."""
    codes = list(code_secnos.keys())
    parent = {c: c for c in codes}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    pairs = []
    for c1, c2 in combinations(codes, 2):
        j = jaccard(code_secnos[c1], code_secnos[c2])
        pairs.append((c1, c2, j))

    # Sort pairs by jaccard desc for reporting
    pairs.sort(key=lambda x: x[2], reverse=True)

    # Union pairs above threshold
    for c1, c2, j in pairs:
        if j >= JACCARD_THRESHOLD:
            union(c1, c2)

    # Group by root
    groups = defaultdict(list)
    for c in codes:
        groups[find(c)].append(c)

    return list(groups.values()), pairs


def describe_family(members, code_secnos, title_maps):
    """Find shared L2 sec_nos within a family and dominant titles."""
    sets = [code_secnos[c] for c in members if code_secnos.get(c)]
    if not sets:
        return [], {}
    shared = sets[0].copy()
    for s in sets[1:]:
        shared &= s

    # Collect titles for shared sec_nos
    title_counts = defaultdict(list)
    for c in members:
        tm = title_maps.get(c, {})
        for sn in shared:
            if sn in tm:
                title_counts[sn].append(tm[sn])

    # Most common title per sec_no
    dominant_titles = {}
    for sn, titles in title_counts.items():
        from collections import Counter
        dominant_titles[sn] = Counter(titles).most_common(1)[0][0]

    return sorted(shared, key=lambda x: [int(p) for p in x.split(".")]), dominant_titles


def infer_family_label(members, shared_sec_nos, dominant_titles, code_names):
    """Heuristic label from dominant titles and code names."""
    titles_lower = " ".join(dominant_titles.get(sn, "") for sn in shared_sec_nos).lower()
    names_sample = " ".join(code_names.get(c, "") for c in members[:5])

    # Check dominant shared titles for structural signals
    has_facility_titles = "배치기준" in titles_lower or "저장설비기준" in titles_lower or "가스설비기준" in titles_lower
    has_mfg_titles = "제조설비" in titles_lower or "재료" in titles_lower or "성능" in titles_lower

    # Check code name patterns
    is_facility = "시설·기술·검사" in names_sample and ("충전" in names_sample or "저장" in names_sample or "사용" in names_sample)
    is_manufacturing = "제조의 시설·기술·검사" in names_sample

    if has_facility_titles or is_facility:
        return "시설기준 패턴 (배치/기초/저장/가스설비/배관)"
    if has_mfg_titles or is_manufacturing:
        return "제조기준 패턴 (제조설비/재료/성능/검사종류)"
    if "재검사" in names_sample:
        return "재검사 패턴"
    return "기타 패턴"


def main():
    code_names = load_code_names()

    code_secnos = {}
    title_maps = {}
    missing = []

    for code in ALL_CODES:
        sec_nos, title_map = extract_sec_nos(code)
        if sec_nos is None:
            missing.append(code)
            print(f"[WARNING] No section JSON for {code} -- skipping from clustering")
        else:
            code_secnos[code] = sec_nos
            title_maps[code] = title_map
            print(f"[load] {code}: {len(sec_nos)} L1+L2 sec_nos")

    if not code_secnos:
        print("[ERROR] No section data loaded")
        return

    print(f"\nClustering {len(code_secnos)} codes with Jaccard >= {JACCARD_THRESHOLD}...")
    groups, all_pairs = cluster_codes(code_secnos)

    # Sort groups by size desc
    groups.sort(key=lambda g: -len(g))

    # Assign family IDs
    family_letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    families = []
    for idx, members in enumerate(groups):
        fid = family_letters[idx] if idx < len(family_letters) else str(idx)

        if len(members) == 1:
            # Single member = outlier candidate; handled below
            pass

        shared_sec_nos, dominant_titles = describe_family(members, code_secnos, title_maps)
        label = infer_family_label(members, shared_sec_nos, dominant_titles, code_names)

        # Within-family Jaccard stats
        within_pairs = [(c1, c2, j) for c1, c2, j in all_pairs if c1 in members and c2 in members]
        avg_j = sum(j for _, _, j in within_pairs) / len(within_pairs) if within_pairs else 1.0

        families.append({
            "id": fid,
            "label": label,
            "members": sorted(members),
            "size": len(members),
            "shared_sec_nos_l2": shared_sec_nos,
            "shared_titles": dominant_titles,
            "avg_within_jaccard": round(avg_j, 3),
        })

    # Separate outliers (singleton families)
    outlier_families = [f for f in families if f["size"] == 1]
    main_families = [f for f in families if f["size"] > 1]

    # Re-ID: only main families get letters
    for idx, f in enumerate(main_families):
        f["id"] = family_letters[idx]
    for f in outlier_families:
        del f["id"]

    # Cross-family shared sec_nos (appear in ALL families with size > 1)
    if main_families:
        cross_shared = set(main_families[0]["shared_sec_nos_l2"])
        for f in main_families[1:]:
            cross_shared &= set(f["shared_sec_nos_l2"])
        cross_shared_list = sorted(cross_shared, key=lambda x: [int(p) for p in x.split(".")])
    else:
        cross_shared_list = []

    # Top-N most similar pairs
    top_pairs = [
        {"code1": c1, "code2": c2, "jaccard": round(j, 4)}
        for c1, c2, j in all_pairs[:20]
    ]

    outlier_codes = [f["members"][0] for f in outlier_families]

    output = {
        "total_codes": len(code_secnos),
        "missing_codes": missing,
        "jaccard_threshold": JACCARD_THRESHOLD,
        "families": main_families,
        "cross_family_shared_sec_nos": cross_shared_list,
        "top_similar_pairs": top_pairs,
        "outliers": outlier_codes,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n[done] Wrote {OUTPUT_PATH}")

    print(f"\n=== Family Summary ===")
    for f in main_families:
        print(f"  Family {f['id']} ({f['label']}): {f['size']} members -- {f['members']}")
        print(f"    shared L2 sec_nos ({len(f['shared_sec_nos_l2'])}): {f['shared_sec_nos_l2'][:8]}...")
        print(f"    avg within-Jaccard: {f['avg_within_jaccard']}")
    if outlier_codes:
        print(f"\n  Outliers: {outlier_codes}")
    print(f"\nCross-family shared sec_nos ({len(cross_shared_list)}): {cross_shared_list}")
    print(f"\nTop 5 most similar pairs:")
    for p in top_pairs[:5]:
        print(f"  {p['code1']} <-> {p['code2']}: {p['jaccard']}")


if __name__ == "__main__":
    main()
