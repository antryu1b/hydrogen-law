"""Ingest marine technical standards (PDF) → Supabase law_articles (searchable).
  - MOFFC 해수부 「선박수소연료전지설비 잠정기준」: clean 제N조(제목) structure.
  - GC-12-K 한국선급 「선박용 연료전지 시스템 지침」: 장/절 structure (no 조).
Tagged law_type='기술기준'. Synthetic stable law_id for idempotent delete-by-law_id.
"""
import os, re, json, urllib.request, urllib.error, urllib.parse
import pypdf

BASE = os.path.expanduser('~/PRJs/hydrogen-law/data/marine_pdfs')
STANDARDS = [
    {
        "file": "MOF_선박수소연료전지설비_잠정기준_2024.pdf",
        "law_name": "선박수소연료전지설비 잠정기준",
        "law_type": "기술기준",
        "law_id": "MOFFC-2024",
        "mode": "jo",
    },
    {
        "file": "KR_선박용연료전지시스템지침_2024_GC-12-K.pdf",
        "law_name": "선박용 연료전지 시스템 지침 (GC-12-K)",
        "law_type": "기술기준",
        "law_id": "GC12K-2024",
        "mode": "jang_jeol",
    },
    {
        "file": "KR_저인화점연료선박규칙_2026.pdf",
        "law_name": "저인화점연료선박 규칙 (KR 2026)",
        "law_type": "기술기준",
        "law_id": "KRLFP-2026",
        "mode": "jang_jeol",
    },
]

def load_env():
    url = key = None
    for p in [os.path.expanduser('~/PRJs/hydrogen-law/.env.local')]:
        for line in open(p, encoding='utf-8'):
            if line.startswith('NEXT_PUBLIC_SUPABASE_URL='): url = line.split('=',1)[1].strip().strip('"').strip("'")
            elif line.startswith('SUPABASE_SERVICE_ROLE_KEY='): key = line.split('=',1)[1].strip().strip('"').strip("'")
    return url, key

def extract(path):
    r = pypdf.PdfReader(path)
    return "\n".join((p.extract_text() or '') for p in r.pages)

def parse_jo(text, law_name, law_type, law_id):
    # split by 제N조(제목); dedup by longest content (drops TOC stubs)
    pat = re.compile(r'(제\s?\d+\s?조(?:의\d+)?\s*\([^)]{1,40}\))')
    parts = pat.split(text)
    best = {}  # article_no -> (title, content)
    i = 1
    while i < len(parts):
        header = parts[i].strip()
        body = (parts[i+1] if i+1 < len(parts) else '').strip()
        nm = re.search(r'제\s?(\d+)\s?조(?:의(\d+))?', header)
        if nm:
            ano = f"제{nm.group(1)}조" + (f"의{nm.group(2)}" if nm.group(2) else '')
            tm = re.search(r'\(([^)]+)\)', header)
            title = tm.group(1) if tm else ''
            full = f"{re.sub(chr(92)+'s+',' ',header)}\n\n{body}"
            if ano not in best or len(full) > len(best[ano][1]):
                best[ano] = (title, full)
        i += 2
    clean = re.sub(r'\s+', '', law_name)
    rows = []
    for ano, (title, content) in best.items():
        if len(content) < 40:  # skip TOC noise
            continue
        rows.append({"id": f"{clean}_{ano}", "law_name": law_name, "law_id": law_id,
                     "article_no": ano, "title": title, "content": content, "law_type": law_type})
    return rows

def parse_jang_jeol(text, law_name, law_type, law_id):
    # split by 제 N 절 (절) sections, keep 장 context. Best-effort for the guideline.
    # Line-anchored: only headings at line start count — mid-sentence references
    # ("…제15장 301.의 2항…") must not leak into article labels.
    pat = re.compile(r'(?m)^[ \t]*(제\s?\d+\s?[장절][^\n]{0,40})')
    parts = pat.split(text)
    clean = re.sub(r'\s+', '', law_name)
    rows, cur_jang = [], ''
    i = 1
    while i < len(parts):
        header = re.sub(r'\s+', ' ', parts[i].strip())
        body = (parts[i+1] if i+1 < len(parts) else '').strip()
        # TOC dot-leader lines ("제 16 장 제조 및 시험 ····· 27") are noise —
        # never a real heading, never 장 context. Single '·' can be a legit
        # middle dot in headings — only a RUN of dots marks a TOC line.
        if '··' in header:
            i += 2
            continue
        # pypdf sometimes glues the first sub-clause onto the heading line
        # ("…비파괴검사301. 일반사항…") — cut at the NNN. marker.
        header = re.split(r'\s*\d{3}\.', header)[0].strip()
        # Glued "제 N 장 …제 M 절 …" on one line — split into 장 context + 절 heading
        gm = re.match(r'^(제\s?\d+\s?장\s?.{0,30}?)\s*(제\s?\d+\s?절\s?.*)$', header)
        if gm:
            cur_jang = gm.group(1).strip()
            header = gm.group(2).strip()
        if '장' in header.split('절')[0][:8] and '절' not in header:
            cur_jang = header
        ano = f"{cur_jang} {header}".strip() if cur_jang and cur_jang != header else header
        if len(body) >= 40:
            rows.append({"id": f"{clean}_{re.sub(chr(92)+'s+','',ano)[:60]}_{i}",
                         "law_name": law_name, "law_id": law_id, "article_no": ano[:60],
                         "title": header[:60], "content": f"{ano}\n\n{body}", "law_type": law_type})
        i += 2
    return rows

def delete_by_law_id(url, key, law_id):
    ep = f"{url}/rest/v1/law_articles?law_id=eq.{urllib.parse.quote(law_id)}"
    req = urllib.request.Request(ep, headers={"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "return=minimal"}, method='DELETE')
    try:
        urllib.request.urlopen(req, timeout=60)
    except Exception as e:
        print("  del err", e)

def upsert(url, key, rows):
    ep = f"{url}/rest/v1/law_articles?on_conflict=id"
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"}
    ok = 0
    for b in range(0, len(rows), 100):
        batch = rows[b:b+100]
        req = urllib.request.Request(ep, data=json.dumps(batch, ensure_ascii=False).encode('utf-8'), headers=h, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                if r.status in (200,201,204): ok += len(batch)
        except urllib.error.HTTPError as e:
            print("  HTTP", e.code, e.read().decode()[:200])
    return ok

def main():
    import sys
    only = sys.argv[1] if len(sys.argv) > 1 else None  # law_id to ingest alone
    url, key = load_env()
    for s in STANDARDS:
        if only and s["law_id"] != only:
            continue
        path = os.path.join(BASE, s["file"])
        text = extract(path)
        rows = parse_jo(text, s["law_name"], s["law_type"], s["law_id"]) if s["mode"] == "jo" \
            else parse_jang_jeol(text, s["law_name"], s["law_type"], s["law_id"])
        delete_by_law_id(url, key, s["law_id"])
        up = upsert(url, key, rows)
        print(f'{s["law_name"]}: {len(rows)} parsed -> {up} upserted')

if __name__ == "__main__":
    main()
