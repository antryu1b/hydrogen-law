import { NextResponse } from 'next/server';
import { intelSupabase } from '@/lib/intel';

// Vercel Cron (daily) — pulls Google News RSS for 수전해 keywords, dedupes by URL
// and inserts new articles into intel_news. Existing URLs are left untouched
// (ON CONFLICT DO NOTHING), so seeded/edited rows are never overwritten.
// Auth: middleware requires `Authorization: Bearer ${CRON_SECRET}` on /api/cron/*.

export const runtime = 'nodejs';
export const maxDuration = 60;

// Company map migrated from the legacy dashboard (KG_CO_MAP). Order matters:
// more specific keys (삼성E&A) must come before generic ones (삼성).
const COMPANIES: { label: string; query: string; keys: string[] }[] = [
  { label: 'NEL ASA', query: 'Nel 수전해', keys: ['NEL', 'Nel'] },
  { label: 'ITM Power', query: 'ITM Power 수전해', keys: ['ITM'] },
  { label: 'Plug Power', query: '플러그파워 수전해', keys: ['Plug', '플러그'] },
  { label: '삼성E&A', query: '삼성E&A 수전해', keys: ['삼성E&A', '삼성 E&A', 'Samsung E&A', '삼성이앤에이', 'CompassH2'] },
  { label: '현대차·HTWO', query: '현대차 수전해', keys: ['현대차', 'HTWO', '현대로템', '현대자동차'] },
  { label: '포스코홀딩스', query: '포스코 수전해', keys: ['포스코', 'POSCO'] },
  { label: 'Accelera', query: 'Accelera 커민스 수전해', keys: ['Accelera', 'Cummins', '커민스'] },
  { label: 'Siemens Energy', query: '지멘스에너지 수전해', keys: ['Siemens', '지멘스'] },
  { label: 'Toyota·Chiyoda', query: '도요타 수전해', keys: ['Toyota', '도요타', 'Chiyoda', '치요다'] },
];

// General queries. The legacy KG_NEWS_KW list ('동향','뉴스','최신',…) is chat-intent
// vocabulary; only its event words are useful as search terms, combined with 수전해.
const GENERAL_QUERIES = ['수전해', '수전해 (수주 OR 계약 OR 출시 OR 발표 OR 실적 OR 현황)', 'PEM 전해조', '그린수소 전해조'];

const MAX_AGE_DAYS = 30;
const PER_QUERY = 40;

interface Item {
  url: string;
  title: string;
  published_at: string | null;
  category: string;
  company: string | null;
  source: 'rss';
  payload: { publisher?: string; query: string };
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .trim();
}

function tag(xml: string, name: string): string {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decode(m[1]) : '';
}

function matchCompany(title: string): string | null {
  return COMPANIES.find((c) => c.keys.some((k) => title.includes(k)))?.label ?? null;
}

async function fetchQuery(query: string, fallbackCompany: string | null): Promise<Item[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'hydrogen-law-intel/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400_000;
  const items: Item[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const link = tag(block, 'link');
    if (!/^https?:\/\//.test(link)) continue;
    const publisher = tag(block, 'source');
    let title = tag(block, 'title');
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3));
    const pub = Date.parse(tag(block, 'pubDate'));
    if (Number.isFinite(pub) && pub < cutoff) continue;
    const company = matchCompany(title) ?? fallbackCompany;
    items.push({
      url: link,
      title,
      published_at: Number.isFinite(pub) ? new Date(pub).toISOString().slice(0, 10) : null,
      category: company ? '경쟁사' : '동향',
      company,
      source: 'rss',
      payload: { ...(publisher ? { publisher } : {}), query },
    });
    if (items.length >= PER_QUERY) break;
  }
  return items;
}

export async function GET() {
  const sb = intelSupabase();
  if (!sb) return NextResponse.json({ error: 'Supabase env not set' }, { status: 503 });

  const jobs = [
    ...COMPANIES.map((c) => ({ query: c.query, company: c.label })),
    ...GENERAL_QUERIES.map((q) => ({ query: q, company: null })),
  ];
  const results = await Promise.allSettled(jobs.map((j) => fetchQuery(j.query, j.company)));

  const byUrl = new Map<string, Item>();
  const failures: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      failures.push(`${jobs[i].query}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      return;
    }
    for (const item of r.value) if (!byUrl.has(item.url)) byUrl.set(item.url, item);
  });

  const rows = [...byUrl.values()];
  let inserted = 0;
  if (rows.length) {
    const { data, error } = await sb
      .from('intel_news')
      .upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
      .select('url');
    if (error) {
      return NextResponse.json({ ok: false, error: error.message, fetched: rows.length, failures }, { status: 500 });
    }
    inserted = data?.length ?? 0;
  }

  return NextResponse.json({
    ok: failures.length < jobs.length,
    timestamp: new Date().toISOString(),
    queries: jobs.length,
    fetched: rows.length,
    inserted,
    failures,
  });
}
