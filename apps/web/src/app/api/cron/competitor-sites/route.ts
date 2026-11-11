import { NextResponse } from 'next/server';
import { intelSupabase } from '@/lib/intel';
import {
  COMPETITOR_SOURCES,
  COMPETITOR_WATCH_ID_PREFIX,
  COMPETITOR_WATCH_SECTION,
  nextSnapshot,
  normalizeHtml,
  type CompetitorSource,
  type FetchOutcome,
  type SiteSnapshot,
} from '@/lib/competitor-watch';

// Vercel Cron (daily) — fetches each competitor's official page (COMPETITOR_SOURCES), hashes the
// normalized text and stores one snapshot row per company in intel_competitors
// (id = competitor-watch:<key>, section 'competitor-watch'). The seeded report blocks are never
// read or written here. Figures are only the verbatim matches of the per-source patterns.
// Auth: middleware requires `Authorization: Bearer ${CRON_SECRET}` on /api/cron/*.

export const runtime = 'nodejs';
export const maxDuration = 60;

const CONCURRENCY = 5;
const TIMEOUT_MS = 10_000;
const MAX_HTML_CHARS = 3_000_000;
/** Shorter visible text means a JS shell or a bot-challenge page, not the product page. */
const MIN_TEXT_CHARS = 200;
const USER_AGENT = 'Mozilla/5.0 (compatible; HydrogenLawIntelBot/1.0)';

async function fetchPage(url: string): Promise<FetchOutcome> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const type = res.headers.get('content-type') ?? '';
    if (!/html/i.test(type)) return { ok: false, error: `HTML 아님 (${type.split(';')[0] || '형식 없음'})` };
    const text = normalizeHtml((await res.text()).slice(0, MAX_HTML_CHARS));
    if (text.length < MIN_TEXT_CHARS) return { ok: false, error: '본문 없음' };
    return { ok: true, text };
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') return { ok: false, error: '시간 초과' };
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : '요청 실패' };
  }
}

export async function GET() {
  const sb = intelSupabase();
  if (!sb) return NextResponse.json({ error: 'Supabase env not set' }, { status: 503 });

  const prevRes = await sb.from('intel_competitors').select('payload').eq('section', COMPETITOR_WATCH_SECTION);
  // Without the previous snapshots a run would reset every baseline — skip instead.
  if (prevRes.error) return NextResponse.json({ ok: false, error: prevRes.error.message }, { status: 500 });
  const prev = new Map(
    ((prevRes.data ?? []) as { payload: SiteSnapshot }[]).map((r) => [r.payload.key, r.payload]),
  );

  const now = new Date().toISOString();
  const snapshots: { source: CompetitorSource; snap: SiteSnapshot; sort: number }[] = [];
  for (let i = 0; i < COMPETITOR_SOURCES.length; i += CONCURRENCY) {
    const batch = COMPETITOR_SOURCES.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.all(batch.map((s) => fetchPage(s.url)));
    batch.forEach((source, j) => {
      snapshots.push({ source, snap: nextSnapshot(source, prev.get(source.key), outcomes[j], now), sort: i + j });
    });
  }

  const { error } = await sb.from('intel_competitors').upsert(
    snapshots.map(({ source, snap, sort }) => ({
      id: COMPETITOR_WATCH_ID_PREFIX + source.key,
      section: COMPETITOR_WATCH_SECTION,
      sort,
      payload: snap,
      updated_at: now,
    })),
    { onConflict: 'id' },
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const failed = snapshots.filter((s) => s.snap.status === 'fail');
  return NextResponse.json({
    ok: failed.length < snapshots.length,
    timestamp: now,
    checked: snapshots.length,
    failed: failed.map((s) => ({ key: s.source.key, error: s.snap.error })),
    changed: snapshots.filter((s) => s.snap.changedAt === now).map((s) => s.source.key),
    figures: snapshots.reduce((n, s) => n + (s.snap.status === 'ok' ? s.snap.figures.length : 0), 0),
  });
}
