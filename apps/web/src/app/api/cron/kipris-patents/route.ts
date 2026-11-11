import { NextResponse } from 'next/server';
import { intelSupabase } from '@/lib/intel';
import {
  CURSOR_SECTION,
  EMPTY_CURSOR,
  SEARCH_JOBS,
  advanceJob,
  normalizeAppNo,
  parseKiprisXml,
  planRequests,
  rowsFromItems,
  type CursorState,
  type PatentRow,
} from '@/lib/patent-watch';

// Vercel Cron (daily) — KIPRIS Plus word search for the 수전해 watch sets (A–F, see
// SEARCH_JOBS) and competitor applicants. New hits go to intel_patents as
// section 'patent-watch' / 'patent-competitor' (id = watch:/pcomp:<appNo digits>).
// Existing ids are left untouched (ON CONFLICT DO NOTHING), so later review edits survive.
// FTO records (section 'fto') are only read, for dedupe.
// Backfill: each run fetches at most REQUEST_BUDGET pages, round-robin over the jobs,
// with the per-job page cursor stored in the 'patent-cursor' row.
// Auth: middleware requires `Authorization: Bearer ${CRON_SECRET}` on /api/cron/*.

export const runtime = 'nodejs';
export const maxDuration = 60;

// TLS confirmed: HEAD https://plus.kipris.or.kr/ → HTTP 200, ssl_verify_result=0 (2026-11-11).
const API = 'https://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/getWordSearch';
const ROWS = 50;
const REQUEST_BUDGET = 20; // per run — keeps daily KIPRIS calls bounded
const CONCURRENCY = 5;
const TIMEOUT_MS = 8000;
const CURSOR_ID = 'patent-cursor:kipris';

async function fetchPage(word: string, page: number, key: string) {
  const url = `${API}?word=${encodeURIComponent(word)}&numOfRows=${ROWS}&pageNo=${page}&ServiceKey=${encodeURIComponent(key)}`;
  // Errors carry only status/result codes, never the URL (it contains the key).
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const parsed = parseKiprisXml(await res.text());
  if (!parsed.ok) throw new Error(`resultCode ${parsed.resultCode || '-'} ${parsed.resultMsg}`.trim());
  return parsed;
}

export async function GET() {
  const key = process.env.KIPRIS_API_KEY;
  if (!key) return NextResponse.json({ error: 'KIPRIS_API_KEY not set' }, { status: 503 });
  const sb = intelSupabase();
  if (!sb) return NextResponse.json({ error: 'Supabase env not set' }, { status: 503 });

  const [fto, cur] = await Promise.all([
    sb.from('intel_patents').select('appNo:payload->>appNo').eq('section', 'fto'),
    sb.from('intel_patents').select('payload').eq('id', CURSOR_ID).maybeSingle(),
  ]);
  if (fto.error) return NextResponse.json({ ok: false, error: fto.error.message }, { status: 500 });
  const ftoAppNos = new Set((fto.data ?? []).map((r) => normalizeAppNo((r as { appNo: string | null }).appNo)));
  const prev = (cur.data?.payload as CursorState | undefined) ?? EMPTY_CURSOR;
  const cursor: CursorState = { offset: prev.offset ?? 0, jobs: { ...(prev.jobs ?? {}) } };

  const plan = planRequests(SEARCH_JOBS, cursor, REQUEST_BUDGET);
  const ctx = { ftoAppNos, seenWatch: new Set<string>(), seenCompetitor: new Set<string>(), foundAt: new Date().toISOString() };
  const rows: PatentRow[] = [];
  const failures: string[] = [];
  for (let i = 0; i < plan.length; i += CONCURRENCY) {
    const batch = plan.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((p) => fetchPage(p.job.word, p.page, key)));
    results.forEach((r, j) => {
      const { job, page } = batch[j];
      if (r.status === 'rejected') {
        failures.push(`${job.key} p${page}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
        return;
      }
      cursor.jobs[job.key] = advanceJob(cursor.jobs[job.key], page, r.value.items.length, r.value.totalCount, ROWS);
      rows.push(...rowsFromItems(r.value.items, job, ctx));
    });
  }
  cursor.offset = (cursor.offset + plan.length) % SEARCH_JOBS.length;

  let inserted = 0;
  if (rows.length) {
    const { data, error } = await sb
      .from('intel_patents')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
      .select('id');
    if (error) {
      return NextResponse.json({ ok: false, error: error.message, fetched: rows.length, failures }, { status: 500 });
    }
    inserted = data?.length ?? 0;
  }
  // Saved after the rows so a failed insert retries the same pages next run.
  const { error: cursorError } = await sb.from('intel_patents').upsert({
    id: CURSOR_ID,
    section: CURSOR_SECTION,
    sort: 0,
    payload: { type: CURSOR_SECTION, ...cursor },
    updated_at: new Date().toISOString(),
  });
  if (cursorError) failures.push(`cursor: ${cursorError.message}`);

  return NextResponse.json({
    ok: failures.length < plan.length,
    timestamp: new Date().toISOString(),
    requests: plan.length,
    fetched: rows.length,
    inserted,
    backfillDone: SEARCH_JOBS.filter((j) => cursor.jobs[j.key]?.done).length,
    jobs: SEARCH_JOBS.length,
    failures,
  });
}
