#!/bin/bash
# Upload 시행규칙 articles to Supabase via REST API

SUPABASE_URL="https://ygohwygdwbckgtotlogm.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlnb2h3eWdkd2Jja2d0b3Rsb2dtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTcxNzc2MiwiZXhwIjoyMDg1MjkzNzYyfQ.QjmbsG_IZr9SWU8gCUuBFhdXo1ISOHrGa4lo2RqHqfk"

# Parse markdown and upload using node inline script
node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');

const FILES = [
  { path: path.join(os.homedir(), 'Thairon/legalize-kr/kr/수소경제육성및수소안전관리에관한법률/시행규칙.md'), lawName: '수소경제 육성 및 수소 안전관리에 관한 법률 시행규칙', lawType: '시행규칙' },
  { path: path.join(os.homedir(), 'Thairon/legalize-kr/kr/고압가스안전관리법/시행규칙.md'), lawName: '고압가스 안전관리법 시행규칙', lawType: '시행규칙' },
];

function parseArticles(content, lawName, lawType) {
  content = content.replace(/^---\n[\s\S]*?\n---\n/, '');
  const articles = [];
  const pattern = /(#{4,5}\s+제\d+조(?:의\d+)?\s*(?:\([^)]*\))?)/g;
  const headers = [];
  let m;
  while ((m = pattern.exec(content)) !== null) {
    headers.push({ index: m.index, header: m[1].trim(), len: m[1].length });
  }
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const body = content.slice(h.index + h.len, i+1 < headers.length ? headers[i+1].index : content.length).trim();
    const nm = h.header.match(/제(\d+)조(?:의(\d+))?/);
    let articleNo = nm ? '제'+nm[1]+'조' : h.header;
    if (nm && nm[2]) articleNo += '의'+nm[2];
    const tm = h.header.match(/\(([^)]+)\)/);
    const title = tm ? tm[1] : '';
    const id = lawName.replace(/\s+/g,'') + '_' + articleNo;
    articles.push({ id, law_name: lawName, article_no: articleNo, title, content: h.header+'\\n\\n'+body, law_type: lawType });
  }
  return articles;
}

async function upload(articles) {
  let ok = 0;
  for (const a of articles) {
    const res = await fetch('${SUPABASE_URL}/rest/v1/law_articles', {
      method: 'POST',
      headers: {
        'apikey': '${SUPABASE_KEY}',
        'Authorization': 'Bearer ${SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(a),
    });
    if (res.ok) ok++;
    else console.log('  Error:', a.id, res.status, await res.text());
  }
  return ok;
}

async function main() {
  let total = 0;
  for (const f of FILES) {
    if (!fs.existsSync(f.path)) { console.log('Not found:', f.path); continue; }
    const content = fs.readFileSync(f.path, 'utf-8');
    const articles = parseArticles(content, f.lawName, f.lawType);
    console.log(f.lawName + ': ' + articles.length + ' articles');
    const ok = await upload(articles);
    console.log('  Uploaded: ' + ok + '/' + articles.length);
    total += ok;
  }
  console.log('Total: ' + total);
}
main();
"
