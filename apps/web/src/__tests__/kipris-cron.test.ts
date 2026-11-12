// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { ALL_JOBS } from '@/lib/patent-watch';

const fixture = readFileSync(path.join(__dirname, 'fixtures/kipris-word-search.xml'), 'utf8');
const foreignFixture = readFileSync(path.join(__dirname, 'fixtures/kipris-foreign-search.xml'), 'utf8');
const statusXml =
  '<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><item>' +
  '<applicationNumber>1020110042643</applicationNumber><registerStatus>소멸</registerStatus></item></body></response>';

/** Routes each KIPRIS endpoint to its fixture; `foreign` overrides the overseas response. */
function routedFetch(foreign: () => Response = () => new Response(foreignFixture, { status: 200 })) {
  return vi.fn<(url: string) => Promise<Response>>(async (url) => {
    if (url.includes('getBibliographyDetailInfoSearch')) return new Response(statusXml, { status: 200 });
    if (url.includes('ForeignPatentAdvencedSearchService')) return foreign();
    return new Response(fixture, { status: 200 });
  });
}

// Minimal Supabase stand-in: records upserts, serves FTO appNos and an initial cursor with
// foreignOffset=8 so the first overseas tasks are US-nel / EP-nel (which match the NEL fixture).
const upserts: { rows: unknown; opts: unknown }[] = [];
// Position 8 in ALL_JOBS.filter(country) = US-nel (FOREIGN_APPLICANTS index 4 × 2 = 8).
const INITIAL_FOREIGN_OFFSET = 8;
function fakeSupabase() {
  return {
    from: () => ({
      select: () => ({
        eq: (col: string) => {
          const cursorPayload = col === 'id' ? { payload: { offset: 0, foreignOffset: INITIAL_FOREIGN_OFFSET, jobs: {} } } : null;
          const res = Promise.resolve({ data: col === 'section' ? [{ appNo: '10-2011-0042643' }] : null, error: null });
          return Object.assign(res, { maybeSingle: () => Promise.resolve({ data: cursorPayload, error: null }) });
        },
      }),
      upsert: (rows: unknown, opts?: unknown) => {
        upserts.push({ rows, opts });
        const res = Promise.resolve({ error: null });
        return Object.assign(res, {
          select: () => Promise.resolve({ data: (rows as { id: string }[]).map((r) => ({ id: r.id })), error: null }),
        });
      },
    }),
  };
}

vi.mock('@/lib/intel', () => ({ intelSupabase: () => fakeSupabase() }));

describe('/api/cron/kipris-patents auth', () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('returns 401 without CRON_SECRET', async () => {
    const r = new NextRequest(new URL('/api/cron/kipris-patents', 'https://example.test'));
    expect((await middleware(r)).status).toBe(401);
  });

  it('returns 401 with a wrong bearer token', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const r = new NextRequest(new URL('/api/cron/kipris-patents', 'https://example.test'), {
      headers: { authorization: 'Bearer nope' },
    });
    expect((await middleware(r)).status).toBe(401);
  });
});

describe('/api/cron/kipris-patents GET', () => {
  beforeEach(() => {
    upserts.length = 0;
    process.env.KIPRIS_API_KEY = 'test-key';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.KIPRIS_API_KEY;
  });

  it('returns 503 when KIPRIS_API_KEY is unset', async () => {
    delete process.env.KIPRIS_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('@/app/api/cron/kipris-patents/route');
    expect((await GET()).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('inserts deduped KR + US/EP rows, refreshes FTO status and saves the cursor (happy path)', async () => {
    const fetchMock = routedFetch();
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('@/app/api/cron/kipris-patents/route');
    const body = await (await GET()).json();

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.length).toBeLessThanOrEqual(20);
    // 확인 필요: REST 경로 https 미검증 — 배포 후 첫 수동 실행으로 확인; must use https.
    expect(urls.every((u) => /^https:\/\/plus\.kipris\.or\.kr\//.test(u))).toBe(true);
    // One KR FTO number → one status request; the rest are searches across KR / US / EP.
    expect(urls.filter((u) => u.includes('getBibliographyDetailInfoSearch?applicationNumber=1020110042643'))).toHaveLength(1);
    expect(urls.some((u) => u.includes('getWordSearch?word='))).toBe(true);
    expect(urls.some((u) => u.includes('applicantSearch?applicant=') && u.includes('collectionValues=US'))).toBe(true);
    expect(urls.some((u) => u.includes('collectionValues=EP') && u.includes('accessKey=test-key'))).toBe(true);
    expect(body.ok).toBe(true);
    expect(body.failures).toEqual([]);
    // 1 status + 16 KR + 3 overseas = 20; searchRequests = 16 KR + 3 overseas = 19.
    expect(body).toMatchObject({ requests: 20, statusRequests: 1, searchRequests: 19, statusUpdated: 1 });

    const [rowsCall, statusCall, cursorCall] = upserts;
    expect(rowsCall.opts).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    const ids = (rowsCall.rows as { id: string }[]).map((r) => r.id).sort();
    // KR: FTO appNo, lithium (excluded) and the 2008 filing are skipped; within-run duplicates collapse.
    // US/EP: only NEL's electrolyzer filing (fuel-cell-only, pre-2010 and non-NEL entries dropped).
    expect(ids).toEqual([
      'pcomp:1020190087654',
      'pcomp:1020230123456',
      'pcomp:EP:17123456',
      'pcomp:US:17123456',
      'watch:1020190087654',
      'watch:1020230123456',
      'watch:EP:17123456',
      'watch:US:17123456',
    ]);
    expect(body.inserted).toBe(8);

    // Status rows overwrite (no ignoreDuplicates) and live in their own section.
    expect(statusCall.opts).toEqual({ onConflict: 'id' });
    expect(statusCall.rows).toMatchObject([
      { id: 'pstatus:1020110042643', section: 'patent-status', payload: { registerStatus: '소멸', source: 'KIPRIS' } },
    ]);

    const cursor = cursorCall.rows as {
      section: string;
      payload: {
        offset: number;
        foreignOffset: number;
        statusOffset: number;
        jobs: Record<string, { done: boolean }>;
        checks: object;
        overseasTiming: { country: string; job: string; ms: number; outcome: string }[];
      };
    };
    expect(cursor.section).toBe('patent-cursor');
    // KR offset: (0 + 16 KR tasks) % 28 = 16.
    expect(cursor.payload.offset).toBe(16);
    // Foreign offset: (8 + 3 overseas dispatched) % 38 = 11.
    expect(cursor.payload.foreignOffset).toBe(11);
    expect(cursor.payload.statusOffset).toBe(0); // one target → wraps to 0
    // KR totalCount 5 < numOfRows and overseas totalCount 4 on page 1: every fetched job is finished.
    expect(Object.values(cursor.payload.jobs).every((j) => j.done)).toBe(true);
    expect(Object.keys(cursor.payload.checks).sort()).toEqual(['EP', 'KR', 'US', 'status']);

    // Overseas timing: 3 entries (US-nel, EP-nel, US-itm); all 'ok' in mock (fetch resolves instantly).
    expect(cursor.payload.overseasTiming).toHaveLength(3);
    expect(cursor.payload.overseasTiming.every((e) => e.outcome === 'ok')).toBe(true);
    expect(cursor.payload.overseasTiming.map((e) => e.country).sort()).toEqual(['EP', 'US', 'US']);
    expect(cursor.payload.overseasTiming.every((e) => typeof e.ms === 'number')).toBe(true);
    // Response also carries timing.
    expect(body.overseasTiming).toHaveLength(3);
    expect(body.overseasTiming.every((e: { job: string }) => !e.job.includes('test-key'))).toBe(true);

    expect(JSON.stringify(upserts)).not.toContain('test-key');
  });

  it('records overseas failures per country without affecting KR rows', async () => {
    const bad = '<response><header><resultCode>99</resultCode><resultMsg>UNKNOWN</resultMsg></header></response>';
    vi.stubGlobal('fetch', routedFetch(() => new Response(bad, { status: 200 })));
    const { GET } = await import('@/app/api/cron/kipris-patents/route');
    const body = await (await GET()).json();

    expect(body.ok).toBe(true);
    const ids = (upserts[0].rows as { id: string }[]).map((r) => r.id);
    expect(ids.length).toBe(4);
    expect(ids.every((id) => !/:(US|EP):/.test(id))).toBe(true);
    const checks = (upserts[2].rows as { payload: { checks: Record<string, { requests: number; failures: string[] }> } })
      .payload.checks;
    expect(checks.KR.failures).toEqual([]);
    expect(checks.US.failures.length).toBe(checks.US.requests);
    expect(checks.US.failures[0]).toMatch(/^US-\S+ p1: resultCode 99/);
    expect(checks.EP.failures.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain('test-key');
  });

  it('skips overseas batches when the deadline would be exceeded and records timing as skipped', async () => {
    const fetchMock = routedFetch();
    vi.stubGlobal('fetch', fetchMock);
    // Date.now() is called twice in the overseas phase: once for runStart, once for the guard check.
    // The KR phase has no Date.now() calls. Returning 0 then 31_001 gives:
    //   31_001 - 0 + OVERSEAS_TIMEOUT_MS(20_000) = 51_001 > DEADLINE_MS(50_000) → all 3 overseas skipped.
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(31_001);
    const { GET } = await import('@/app/api/cron/kipris-patents/route');
    const body = await (await GET()).json();
    vi.restoreAllMocks();

    // All 3 planned overseas tasks recorded as skipped (ms: 0, never dispatched).
    expect(body.overseasTiming).toHaveLength(3);
    expect(body.overseasTiming.every((e: { outcome: string }) => e.outcome === 'skipped')).toBe(true);
    expect(body.overseasTiming.every((e: { ms: number }) => e.ms === 0)).toBe(true);
    expect(body.overseasTiming.every((e: { job: string }) => !e.job.includes('test-key'))).toBe(true);

    // foreignOffset does not advance when no overseas tasks were dispatched.
    const cursor = (upserts[upserts.length - 1].rows as { payload: { foreignOffset: number } });
    expect(cursor.payload.foreignOffset).toBe(INITIAL_FOREIGN_OFFSET);

    // requests reflects only KR + status (no overseas dispatched); result is still ok.
    expect(body.requests).toBe(17); // 1 status + 16 KR + 0 overseas
    expect(body.searchRequests).toBe(16); // plan.kr.length + overseasDone
    expect(body.statusRequests).toBe(1);
    expect(body.ok).toBe(true);
  });

  it('stores a tag-name hint when an overseas 00 response parses to nothing', async () => {
    const odd =
      '<response><header><resultCode>00</resultCode></header><body><list><patentInfo><appNum>1</appNum></patentInfo></list></body></response>';
    vi.stubGlobal('fetch', routedFetch(() => new Response(odd, { status: 200 })));
    const { GET } = await import('@/app/api/cron/kipris-patents/route');
    const body = await (await GET()).json();

    expect(body.foreignDiag.tags).toBe('response,header,resultCode,body,list,patentInfo,appNum');
    expect(body.foreignDiag.job).toMatch(/^(US|EP)-/);
    const cursor = upserts[upserts.length - 1].rows as { payload: { foreignDiag: { tags: string } } };
    expect(cursor.payload.foreignDiag.tags).toBe(body.foreignDiag.tags);
  });

  it('surfaces HTML gateway responses as non-XML failures with ok:false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><body>502 Bad Gateway</body></html>', { status: 200 })));
    const { GET } = await import('@/app/api/cron/kipris-patents/route');
    const body = await (await GET()).json();

    expect(body.ok).toBe(false);
    expect(body.inserted).toBe(0);
    expect(body.failures.some((f: string) => f.includes('non-XML response'))).toBe(true);
    expect(JSON.stringify(body)).not.toContain('test-key');
  });

  it('reports resultCode errors without inserting or advancing jobs', async () => {
    const err = '<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY IS NOT REGISTERED ERROR.</resultMsg></header></response>';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(err, { status: 200 })));
    const { GET } = await import('@/app/api/cron/kipris-patents/route');
    const body = await (await GET()).json();

    expect(body.ok).toBe(false);
    expect(body.inserted).toBe(0);
    expect(body.failures[0]).toMatch(/resultCode 30/);
    expect(JSON.stringify(body)).not.toContain('test-key');
    expect(upserts).toHaveLength(1); // cursor only
    expect((upserts[0].rows as { payload: { jobs: object } }).payload.jobs).toEqual({});
    expect(JSON.stringify(upserts)).not.toContain('test-key');
  });
});
