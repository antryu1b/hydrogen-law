import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const SUPABASE_URL = 'https://ygohwygdwbckgtotlogm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY env var');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const FILES = [
  {
    path: resolve(homedir(), 'Thairon/legalize-kr/kr/수소경제육성및수소안전관리에관한법률/시행규칙.md'),
    lawName: '수소경제 육성 및 수소 안전관리에 관한 법률 시행규칙',
    lawType: '시행규칙',
  },
  {
    path: resolve(homedir(), 'Thairon/legalize-kr/kr/고압가스안전관리법/시행규칙.md'),
    lawName: '고압가스 안전관리법 시행규칙',
    lawType: '시행규칙',
  },
];

function parseArticles(content, lawName, lawType) {
  // Remove YAML frontmatter
  content = content.replace(/^---\n[\s\S]*?\n---\n/, '');

  const articles = [];
  // Split by article headers: ##### 제N조 or #### 제N조
  const pattern = /(#{4,5}\s+제\d+조(?:의\d+)?\s*(?:\([^)]*\))?)/g;
  const headers = [];
  let match;

  while ((match = pattern.exec(content)) !== null) {
    headers.push({ index: match.index, header: match[1].trim() });
  }

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].header;
    const start = headers[i].index + headers[i].header.length;
    const end = i + 1 < headers.length ? headers[i + 1].index : content.length;
    const body = content.slice(start, end).trim();

    // Extract article number
    const numMatch = header.match(/제(\d+)조(?:의(\d+))?/);
    let articleNo = numMatch ? `제${numMatch[1]}조` : header;
    if (numMatch && numMatch[2]) articleNo += `의${numMatch[2]}`;

    // Extract title
    const titleMatch = header.match(/\(([^)]+)\)/);
    const title = titleMatch ? titleMatch[1] : '';

    const fullContent = `${header}\n\n${body}`;
    const cleanName = lawName.replace(/\s+/g, '');
    const id = `${cleanName}_${articleNo}`;

    articles.push({ id, law_name: lawName, law_id: null, article_no: articleNo, title, content: fullContent, law_type: lawType });
  }

  return articles;
}

async function main() {
  let totalUploaded = 0;

  for (const file of FILES) {
    let content;
    try {
      content = readFileSync(file.path, 'utf-8');
    } catch (e) {
      console.log(`File not found: ${file.path}`);
      continue;
    }

    const articles = parseArticles(content, file.lawName, file.lawType);
    console.log(`\n${file.lawName}: ${articles.length} articles parsed`);

    let uploaded = 0;
    for (const article of articles) {
      try {
        const { error } = await supabase.from('law_articles').upsert(article, { onConflict: 'id' });
        if (error) {
          console.log(`  Error: ${article.id} - ${error.message}`);
        } else {
          uploaded++;
        }
      } catch (e) {
        console.log(`  Error: ${article.id} - ${e.message}`);
      }
    }

    console.log(`  Uploaded: ${uploaded}/${articles.length}`);
    totalUploaded += uploaded;
  }

  console.log(`\nTotal uploaded: ${totalUploaded}`);
}

main();
