#!/bin/bash
# Upload priority laws (energy/gas/safety/environment) from legalize-kr to Supabase

set -e

SUPABASE_URL="https://ygohwygdwbckgtotlogm.supabase.co"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [ -z "$SUPABASE_KEY" ]; then
  echo "Error: SUPABASE_SERVICE_ROLE_KEY env var required"
  exit 1
fi

LEGALIZE_DIR="$HOME/Thairon/legalize-kr/kr"
PATTERN="수소|고압가스|에너지|연료|위험물|화학물질|가스|석유|광산|기후|온실가스|전기사업|전기안전|신에너지|재생에너지|친환경|자원|발전|배관|용기|저장|충전|폭발|독성"

TMP_LIST=$(mktemp)
ls "$LEGALIZE_DIR" | grep -E "$PATTERN" > "$TMP_LIST"
TOTAL=$(wc -l < "$TMP_LIST" | tr -d ' ')

echo "Priority laws: $TOTAL"
echo "============================"

node - "$LEGALIZE_DIR" "$TMP_LIST" "$SUPABASE_URL" "$SUPABASE_KEY" <<'NODE_SCRIPT'
const fs = require('fs');
const path = require('path');

const [, , LEGALIZE_DIR, LIST_FILE, SUPABASE_URL, SUPABASE_KEY] = process.argv;
const lawDirs = fs.readFileSync(LIST_FILE, 'utf-8').split('\n').filter(Boolean);

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([^:]+):\s*(.+)$/);
    if (m) meta[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return { meta, body: content.slice(match[0].length) };
}

function parseArticles(content, lawName, lawType) {
  const { meta, body } = parseFrontmatter(content);
  const articles = [];
  const pattern = /(#{4,5}\s+제\d+조(?:의\d+)?\s*(?:\([^)]*\))?)/g;
  const headers = [];
  let m;
  while ((m = pattern.exec(body)) !== null) {
    headers.push({ index: m.index, header: m[1].trim(), len: m[1].length });
  }
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const start = h.index + h.len;
    const end = i + 1 < headers.length ? headers[i + 1].index : body.length;
    const text = body.slice(start, end).trim();
    const nm = h.header.match(/제(\d+)조(?:의(\d+))?/);
    let articleNo = nm ? `제${nm[1]}조` : h.header;
    if (nm && nm[2]) articleNo += `의${nm[2]}`;
    const tm = h.header.match(/\(([^)]+)\)/);
    const title = tm ? tm[1] : '';
    const id = lawName.replace(/\s+/g, '') + '_' + articleNo;
    articles.push({ id, law_name: lawName, law_id: meta['법령ID'] || null, article_no: articleNo, title, content: h.header + '\n\n' + text, law_type: lawType });
  }
  return articles;
}

async function upload(articles) {
  // Deduplicate by id within entire law (later overwrites earlier)
  const dedup = new Map();
  for (const a of articles) dedup.set(a.id, a);
  const unique = [...dedup.values()];

  let ok = 0, fail = 0;
  const BATCH = 50;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/law_articles`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(batch),
    });
    if (res.ok) ok += batch.length;
    else { fail += batch.length; console.log(`  Batch error ${res.status}:`, (await res.text()).slice(0, 100)); }
  }
  return { ok, fail };
}

(async () => {
  let totalArticles = 0, totalOk = 0, totalFail = 0;
  let processed = 0;
  for (const dir of lawDirs) {
    processed++;
    const dirPath = path.join(LEGALIZE_DIR, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
    let lawArticles = [];
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const { meta } = parseFrontmatter(content);
      const lawName = meta['제목'] || `${dir} ${file.replace('.md', '')}`;
      const lawType = file.replace('.md', '');
      const articles = parseArticles(content, lawName, lawType);
      lawArticles.push(...articles);
    }
    if (lawArticles.length === 0) continue;
    const { ok, fail } = await upload(lawArticles);
    totalArticles += lawArticles.length; totalOk += ok; totalFail += fail;
    console.log(`[${processed}/${lawDirs.length}] ${dir}: ${ok}/${lawArticles.length}`);
  }
  console.log(`\nTotal: ${totalOk} uploaded / ${totalFail} failed / ${totalArticles} parsed`);
})();
NODE_SCRIPT

rm -f "$TMP_LIST"
