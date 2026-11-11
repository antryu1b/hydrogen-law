// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

const fixture = readFileSync(path.join(__dirname, 'fixtures/kipris-word-search.xml'), 'utf8');

// Minimal Supabase stand-in: records upserts, serves FTO appNos and no cursor.
const upserts: { rows: unknown; opts: unknown }[] = [];
function fakeSupabase() {
  return {
    from: () => ({
      select: () => ({
        eq: (col: string) => {
          const res = Promise.resolve({ data: col === 'section' ? [{ appNo: '10-2011-0042643' }] : null, error: null });
          return Object.assign(res, { maybeSingle: () => Promise.resolve({ data: null, error: null }) });
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

  it('inserts deduped rows and saves the cursor (happy path)', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => new Response(fixture, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('@/app/api/cron/kipris-patents/route');
    const body = await (await GET()).json();

    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(20);
    // Issue 4: KIPRIS Plus supports TLS (confirmed 2026-11-11); must use https.
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/plus\.kipris\.or\.kr\//);
    expect(String(fetchMock.mock.calls[0][0])).toContain('getWordSearch?word=');
    expect(body.ok).toBe(true);
    expect(body.failures).toEqual([]);

    const [rowsCall, cursorCall] = upserts;
    expect(rowsCall.opts).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    const ids = (rowsCall.rows as { id: string }[]).map((r) => r.id).sort();
    // FTO appNo, lithium (excluded) and the 2008 filing are skipped; within-run duplicates collapse.
    expect(ids).toEqual(['pcomp:1020190087654', 'pcomp:1020230123456', 'watch:1020190087654', 'watch:1020230123456']);
    expect(body.inserted).toBe(4);

    const cursor = cursorCall.rows as { id: string; section: string; payload: { offset: number; jobs: Record<string, unknown> } };
    expect(cursor.section).toBe('patent-cursor');
    expect(cursor.payload.offset).toBe(fetchMock.mock.calls.length);
    // totalCount 5 < numOfRows: every fetched job is finished after one page.
    expect(Object.values(cursor.payload.jobs).every((j) => (j as { done: boolean }).done)).toBe(true);
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
  });
});
