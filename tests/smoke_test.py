"""
Smoke test — H1 before/after search equivalence gate.

Usage:
  # Capture baseline (run once before H1 refactor):
  python tests/smoke_test.py capture --url http://localhost:3000 --out tests/fixtures/search_before.json

  # Verify after refactor:
  python tests/smoke_test.py verify --url http://localhost:3000 --baseline tests/fixtures/search_before.json

Gate: top-3 article_ids must match 100% across all 5 queries.
"""

import json
import sys
import urllib.request
import urllib.error


QUERIES_FILE = "tests/fixtures/smoke_queries.json"


def search(base_url: str, query: str, top_k: int) -> list:
    """POST /api/search and return article_ids list."""
    url = f"{base_url}/api/search"
    payload = json.dumps({"query": query, "top_k": top_k}).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            return [a.get("article_id") for a in data.get("articles", [])]
    except urllib.error.URLError as exc:
        print(f"  [ERROR] {query!r}: {exc}")
        return []


def capture(base_url: str, out_path: str) -> None:
    """Capture baseline responses for all queries."""
    with open(QUERIES_FILE) as f:
        queries = json.load(f)

    results = {}
    for item in queries:
        ids = search(base_url, item["query"], item["top_k"])
        results[item["query"]] = ids
        print(f"  captured {len(ids)} results for {item['query']!r}")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nBaseline saved to {out_path}")


def verify(base_url: str, baseline_path: str) -> None:
    """Verify current results match baseline top-3 ids."""
    with open(baseline_path) as f:
        baseline = json.load(f)

    total = 0
    matched = 0
    for query, before_ids in baseline.items():
        after_ids = search(base_url, query, top_k=10)
        top3_before = before_ids[:3]
        top3_after = after_ids[:3]
        is_match = top3_before == top3_after
        total += 1
        if is_match:
            matched += 1
            print(f"  [PASS] {query!r}")
        else:
            print(f"  [FAIL] {query!r}")
            print(f"         before: {top3_before}")
            print(f"         after:  {top3_after}")

    pct = (matched / total * 100) if total > 0 else 0
    print(f"\nSmoke test: {matched}/{total} queries match ({pct:.0f}%)")
    if matched < total:
        print("GATE FAILED — behavior changed during refactor")
        sys.exit(1)
    else:
        print("GATE PASSED — no behavior change detected")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Smoke test for H1 refactor")
    subparsers = parser.add_subparsers(dest="command", required=True)

    cap = subparsers.add_parser("capture", help="Capture baseline")
    cap.add_argument("--url", default="http://localhost:3000")
    cap.add_argument("--out", default="tests/fixtures/search_before.json")

    ver = subparsers.add_parser("verify", help="Verify equivalence")
    ver.add_argument("--url", default="http://localhost:3000")
    ver.add_argument("--baseline", default="tests/fixtures/search_before.json")

    args = parser.parse_args()

    if args.command == "capture":
        capture(args.url, args.out)
    elif args.command == "verify":
        verify(args.url, args.baseline)
