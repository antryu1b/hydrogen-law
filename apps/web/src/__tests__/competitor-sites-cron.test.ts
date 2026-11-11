// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { COMPETITOR_SOURCES, hashText, normalizeHtml, type SiteSnapshot } from '@/lib/competitor-watch';

const acceleraHtml = readFileSync(path.join(__dirname, 'fixtures/competitor-accelera.html'), 'utf8');
const genericHtml = `<html><body><p>${'Official electrolyzer product page. '.repeat(20)}</p></body></html>`;

interface Upsert {
  rows: { id: string; section: string; sort: number; payload: SiteSnapshot; updated_at: string }[];
  opts: unknown;
}
const upserts: Upsert[] = [];
let prevRows: { payload: SiteSnapshot }[] = [];
let selectError: { message: string } | null = null;

function fakeSupabase() {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => {
          expect(table).toBe('intel_competitors');
          expect([col, val]).toEqual(['section', 'competitor-watch']);
          return Promise.resolve({ data: selectError ? null : prevRows, error: selectError });
        },
      }),
      upsert: (rows: Upsert['rows'], opts?: unknown) => {
        expect(table).toBe('intel_competitors');
        upserts.push({ rows, opts });
        return Promise.resolve({ error: null });
      },
    }),
  };
}

vi.mock('@/lib/intel', () => ({ intelSupabase: () => fakeSupabase() }));

function html(body: string, status = 200, type = 'text/html; charset=utf-8') {
  return new Response(body, { status, headers: { 'content-type': type } });
}

describe('/api/cron/competitor-sites auth', () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });
  it('returns 401 without the cron secret', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const r = new NextRequest(new URL('/api/cron/competitor-sites', 'https://example.test'));
    expect((await middleware(r)).status).toBe(401);
  });
});

describe('/api/cron/competitor-sites GET', () => {
  beforeEach(() => {
    upserts.length = 0;
    prevRows = [];
    selectError = null;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches every official URL once and upserts one snapshot row per company', async () => {
    const fetchMock = vi.fn(async (url: string) => (url.includes('accelerazero.com') ? html(acceleraHtml) : html(genericHtml)));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('@/app/api/cron/competitor-sites/route');
    const body = await (await GET()).json();

    expect(fetchMock.mock.calls.map((c) => c[0]).sort()).toEqual(COMPETITOR_SOURCES.map((s) => s.url).sort());
    expect(body).toMatchObject({ ok: true, checked: COMPETITOR_SOURCES.length, failed: [], changed: [], figures: 5 });
    expect(upserts).toHaveLength(1);
    expect(upserts[0].opts).toEqual({ onConflict: 'id' });
    const rows = upserts[0].rows;
    expect(rows.map((r) => r.id)).toEqual(COMPETITOR_SOURCES.map((s) => `competitor-watch:${s.key}`));
    expect(rows.every((r) => r.section === 'competitor-watch')).toBe(true);
    const accel = rows.find((r) => r.id === 'competitor-watch:accelera')!.payload;
    expect(accel).toMatchObject({ status: 'ok', contentHash: hashText(normalizeHtml(acceleraHtml)), changedAt: null });
    expect(accel.figures.map((f) => f.value)).toEqual(['5', '90', '30', '15-100', '52']);
    // Pages without patterns get no figures — only change detection.
    expect(rows.find((r) => r.id === 'competitor-watch:sungrow')!.payload.figures).toEqual([]);
  });

  it('flags a changed page and records failures as 「확인 실패」 without dropping the last good data', async () => {
    const t0 = '2026-11-09T21:00:00.000Z';
    const prevFor = (key: string, text: string): SiteSnapshot => {
      const s = COMPETITOR_SOURCES.find((x) => x.key === key)!;
      return {
        type: 'competitor-watch',
        key,
        company: s.company,
        url: s.url,
        page: s.page,
        checkedAt: t0,
        status: 'ok',
        contentHash: hashText(text),
        changedAt: null,
        lastOkAt: t0,
        figures: [{ label: '정격 출력', value: '5', unit: 'MW' }],
      };
    };
    prevRows = [
      { payload: prevFor('accelera', 'old page text') },
      { payload: prevFor('nel', normalizeHtml(genericHtml)) },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('accelerazero.com')) return html(acceleraHtml);
        if (url.includes('nelhydrogen.com')) return html('blocked', 403);
        if (url.includes('itm-power.com')) throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
        if (url.includes('toyota')) return html('%PDF-1.4', 200, 'application/pdf');
        if (url.includes('sungrowpower.com')) return html('<html><body>Loading…</body></html>');
        return html(genericHtml);
      }),
    );
    const { GET } = await import('@/app/api/cron/competitor-sites/route');
    const body = await (await GET()).json();

    expect(body.ok).toBe(true);
    expect(body.changed).toEqual(['accelera']);
    expect(body.failed).toEqual([
      { key: 'nel', error: 'HTTP 403' },
      { key: 'itm-power', error: '시간 초과' },
      { key: 'toyota', error: 'HTML 아님 (application/pdf)' },
      { key: 'sungrow', error: '본문 없음' },
    ]);
    const byId = Object.fromEntries(upserts[0].rows.map((r) => [r.payload.key, r.payload]));
    expect(byId.accelera.changedAt).toBe(body.timestamp);
    expect(byId.nel).toMatchObject({ status: 'fail', lastOkAt: t0, contentHash: hashText(normalizeHtml(genericHtml)) });
    expect(byId.nel.figures).toEqual([{ label: '정격 출력', value: '5', unit: 'MW' }]);
    expect(byId['itm-power']).toMatchObject({ status: 'fail', lastOkAt: null, figures: [] });
  });

  it('does not write when the previous snapshots cannot be read', async () => {
    selectError = { message: 'boom' };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('@/app/api/cron/competitor-sites/route');
    expect((await GET()).status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });
});
