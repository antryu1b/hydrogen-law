import { NextResponse } from 'next/server';
import { intelSupabase } from '@/lib/intel';
import {
  ALL_JOBS,
  CURSOR_ID,
  CURSOR_SECTION,
  EMPTY_CURSOR,
  advanceForeignJob,
  advanceJob,
  foreignDiag,
  krStatusTargets,
  normalizeAppNo,
  parseForeignXml,
  parseKiprisXml,
  parseStatusXml,
  planRun,
  rowsFromItems,
  statusRow,
  type CheckKey,
  type CheckState,
  type CursorState,
  type KiprisResult,
  type PatentRow,
  type SearchJob,
  type StatusRow,
} from '@/lib/patent-watch';

// Vercel Cron (daily) — KIPRIS Plus collection for the 수전해 watch under one request budget:
//  - KR word search (sets A–F, SEARCH_JOBS) and US/EP overseas applicantSearch (FOREIGN_JOBS),
//    round-robin over ALL_JOBS. New hits go to intel_patents as section 'patent-watch' /
//    'patent-competitor' (id = watch:/pcomp:<digits> for KR, watch:US:<digits> etc. overseas).
//    Existing ids are left untouched (ON CONFLICT DO NOTHING), so later review edits survive.
//  - KR rights-status refresh of FTO records (≤ STATUS_BUDGET per run) into 'patent-status'
//    rows (id = pstatus:<digits>, overwritten each refresh). The reviewed FTO payload is never written.
// FTO records (section 'fto') are otherwise only read, for dedupe.
// Each run sends at most REQUEST_BUDGET requests. The 'patent-cursor' row keeps the per-job page
// cursor, both rotation offsets, the last result per country (`checks`, shown in the UI as
// 「확인 실패」) and the last overseas structure hint (`foreignDiag`).
// Auth: middleware requires `Authorization: Bearer ${CRON_SECRET}` on /api/cron/*.

export const runtime = 'nodejs';
export const maxDuration = 60;

// 확인 필요: REST 경로 https 미검증 — 배포 후 첫 수동 실행으로 확인.
const KIPO = 'https://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice';
// 「추정」 Overseas service per a third-party wrapper (not official docs). "Advenced" is the real spelling.
const FOREIGN = 'https://plus.kipris.or.kr/openapi/rest/ForeignPatentAdvencedSearchService';
const ROWS = 50;
const CONCURRENCY = 5;
const TIMEOUT_MS = 8000;

// Errors carry only status/result codes, never the URL (it contains the key).
async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  // Surface non-XML responses (e.g. HTML gateway error) as an explicit failure entry.
  if (!/<[?]xml|<response/i.test(text)) throw new Error('non-XML response');
  return text;
}

function throwIfNotOk(r: { ok: boolean; resultCode: string; resultMsg: string }) {
  if (!r.ok) throw new Error(`resultCode ${r.resultCode || '-'} ${r.resultMsg}`.trim());
}

type SearchResult = { parsed: KiprisResult; diag: string | null };

async function searchPage(job: SearchJob, page: number, key: string): Promise<SearchResult> {
  if (!job.country) {
    const xml = await fetchXml(
      `${KIPO}/getWordSearch?word=${encodeURIComponent(job.word)}&numOfRows=${ROWS}&pageNo=${page}` +
        `&ServiceKey=${encodeURIComponent(key)}`,
    );
    const parsed = parseKiprisXml(xml);
    throwIfNotOk(parsed);
    return { parsed, diag: null };
  }
  // numOfRows is a guess (page-size param unknown) — harmless if ignored.
  const xml = await fetchXml(
    `${FOREIGN}/applicantSearch?applicant=${encodeURIComponent(job.word)}&collectionValues=${job.country}` +
      `&currentPage=${page}&numOfRows=${ROWS}&sortField=AD&sortState=true&accessKey=${encodeURIComponent(key)}`,
  );
  const parsed = parseForeignXml(xml);
  throwIfNotOk(parsed);
  return { parsed, diag: foreignDiag(xml, parsed) };
}

async function fetchStatus(appNo: string, key: string): Promise<string> {
  const xml = await fetchXml(
    `${KIPO}/getBibliographyDetailInfoSearch?applicationNumber=${appNo}&ServiceKey=${encodeURIComponent(key)}`,
  );
  const r = parseStatusXml(xml);
  throwIfNotOk(r);
  if (!r.registerStatus) throw new Error('registerStatus missing');
  return r.registerStatus;
}

type Task = { kind: 'search'; job: SearchJob; page: number } | { kind: 'status'; appNo: string };
type TaskResult = { kind: 'search'; value: SearchResult } | { kind: 'status'; value: string };

function runTask(t: Task, key: string): Promise<TaskResult> {
  return t.kind === 'status'
    ? fetchStatus(t.appNo, key).then((value) => ({ kind: 'status', value }))
    : searchPage(t.job, t.page, key).then((value) => ({ kind: 'search', value }));
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
  const ftoRaw = (fto.data ?? []).map((r) => (r as { appNo: string | null }).appNo);
  const ftoAppNos = new Set(ftoRaw.map(normalizeAppNo));
  const prev = (cur.data?.payload as CursorState | undefined) ?? EMPTY_CURSOR;
  const cursor: CursorState = { ...prev, offset: prev.offset ?? 0, jobs: { ...(prev.jobs ?? {}) } };

  const now = new Date().toISOString();
  const plan = planRun(ALL_JOBS, cursor, krStatusTargets(ftoRaw));
  const tasks: Task[] = [
    ...plan.status.map((appNo): Task => ({ kind: 'status', appNo })),
    ...plan.search.map((p): Task => ({ kind: 'search', ...p })),
  ];
  const ctx = { ftoAppNos, seenWatch: new Set<string>(), seenCompetitor: new Set<string>(), foundAt: now };
  const rows: PatentRow[] = [];
  const statusRows: StatusRow[] = [];
  const failures: string[] = [];
  const checks: Partial<Record<CheckKey, CheckState>> = {};

  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((t) => runTask(t, key)));
    results.forEach((r, j) => {
      const t = batch[j];
      const checkKey: CheckKey = t.kind === 'status' ? 'status' : (t.job.country ?? 'KR');
      const check = (checks[checkKey] ??= { at: now, requests: 0, failures: [] });
      check.requests++;
      if (r.status === 'rejected') {
        const label = t.kind === 'status' ? `status ${t.appNo}` : `${t.job.key} p${t.page}`;
        const msg = `${label}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`;
        failures.push(msg);
        check.failures.push(msg);
        return;
      }
      if (t.kind === 'status' && r.value.kind === 'status') {
        statusRows.push(statusRow(t.appNo, r.value.value, now));
        return;
      }
      if (t.kind !== 'search' || r.value.kind !== 'search') return;
      const { parsed, diag } = r.value.value;
      const { job, page } = t;
      if (job.country) {
        const dates = parsed.items.map((it) => it.applicationDate.replace(/\D/g, '')).filter(Boolean);
        const oldest = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : '';
        cursor.jobs[job.key] = advanceForeignJob(cursor.jobs[job.key], page, parsed.items.length, parsed.totalCount, oldest);
        if (diag) cursor.foreignDiag = { at: now, job: job.key, tags: diag };
      } else {
        cursor.jobs[job.key] = advanceJob(cursor.jobs[job.key], page, parsed.items.length, parsed.totalCount, ROWS);
      }
      rows.push(...rowsFromItems(parsed.items, job, ctx));
    });
  }
  cursor.offset = plan.nextOffset;
  cursor.statusOffset = plan.nextStatusOffset;
  // Only countries with requests this run replace their previous result.
  cursor.checks = { ...(prev.checks ?? {}), ...checks };

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
  if (statusRows.length) {
    const { error } = await sb
      .from('intel_patents')
      .upsert(
        statusRows.map((r) => ({ ...r, updated_at: now })),
        { onConflict: 'id' },
      );
    if (error) failures.push(`status rows: ${error.message}`);
  }
  // Saved after the rows so a failed insert retries the same pages next run.
  const { error: cursorError } = await sb.from('intel_patents').upsert({
    id: CURSOR_ID,
    section: CURSOR_SECTION,
    sort: 0,
    payload: { type: CURSOR_SECTION, ...cursor },
    updated_at: now,
  });
  if (cursorError) failures.push(`cursor: ${cursorError.message}`);

  return NextResponse.json({
    ok: failures.length < tasks.length,
    timestamp: now,
    requests: tasks.length,
    searchRequests: plan.search.length,
    statusRequests: plan.status.length,
    fetched: rows.length,
    inserted,
    statusUpdated: statusRows.length,
    backfillDone: ALL_JOBS.filter((j) => cursor.jobs[j.key]?.done).length,
    jobs: ALL_JOBS.length,
    foreignDiag: cursor.foreignDiag ?? null,
    failures,
  });
}
